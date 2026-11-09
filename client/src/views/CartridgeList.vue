<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import api from '../api';
import { useReferencesStore } from '../stores/references';
import { useAuthStore } from '../stores/auth';
import BarcodeDisplay from '../components/BarcodeDisplay.vue';
import BarcodeScanner from '../components/BarcodeScanner.vue';

const refs = useReferencesStore();
const auth = useAuthStore();

const cartridges = ref([]);
const allCartridges = ref([]); // full list for batch barcode lookup
const loading = ref(true);
const search = ref('');
const batchScanValue = ref('');
const filterStatus = ref('');
const filterUser = ref('');
const showFilters = ref(false);
let searchTimer = null;
const showAddModal = ref(false);
const showScanner = ref(false);
const showAddScanner = ref(false);
const showBatchScanner = ref(false);
const newCartridge = ref({ name: '', barcode: '', type_id: '', status_id: '', location: '', notes: '' });
const addError = ref('');
const barcodeInput = ref(null);
const addBarcodeInput = ref(null);
const batchScanInput = ref(null);

// Batch mode
const batchMode = ref(false);
const selectedIds = ref([]);
const batchStatusId = ref('');
const batchError = ref('');
const batchSuccess = ref('');
const lastScanResult = ref('');
const lastScanFlash = ref(false);

const refillStatusId = computed(() => refs.getRefillStatusId());
const selectedCartridges = computed(() => cartridges.value.filter(c => selectedIds.value.includes(c.id)));

// In batch mode the full list is loaded once; owner/status filters apply client-side
// so barcode lookup (allCartridges) still sees every cartridge.
const visibleCartridges = computed(() => {
  if (!batchMode.value) return cartridges.value;
  return cartridges.value.filter(c => {
    const matchStatus = !filterStatus.value || String(c.status_id) === String(filterStatus.value);
    const matchUser = !filterUser.value || String(c.assigned_user_id) === String(filterUser.value);
    return matchStatus && matchUser;
  });
});

function toggleSelect(item) {
  const idx = selectedIds.value.indexOf(item.id);
  if (idx >= 0) selectedIds.value.splice(idx, 1);
  else selectedIds.value.push(item.id);
}

function selectAll() {
  selectedIds.value = visibleCartridges.value.filter(c => canSelectForBatch(c)).map(c => c.id);
}

function clearSelection() {
  selectedIds.value = [];
}

function canSelectForBatch(c) {
  if (auth.isAdmin) return true;
  return c.assigned_user_id === auth.user?.id && c.status_id !== refillStatusId.value;
}

async function load() {
  loading.value = true;
  try {
    await refs.loadAll();
    const params = {
      search: search.value || undefined,
      status_id: filterStatus.value || undefined,
      user_id: filterUser.value || undefined
    };
    const { data } = await api.get('/cartridges', { params });
    cartridges.value = data;
    // Keep full list for batch lookup
    if (!search.value && !filterStatus.value && !filterUser.value) {
      allCartridges.value = data;
    }
  } finally {
    loading.value = false;
  }
}

async function loadAllForBatch() {
  try {
    await refs.loadAll();
    const { data } = await api.get('/cartridges');
    cartridges.value = data;
    allCartridges.value = data;
  } catch {} finally {
    loading.value = false;
  }
}

function handleBarcodeKeydown(e) {
  if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchTimer); load(); }
}

function debouncedSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 300);
}

function onScan(code) {
  showScanner.value = false;
  showAddScanner.value = false;
  showBatchScanner.value = false;
  if (showAddModal.value) { newCartridge.value.barcode = code; }
  else if (batchMode.value) { addByBarcode(code); }
  else { search.value = code; clearTimeout(searchTimer); load(); }
}

function addByBarcode(code) {
  const lookupList = allCartridges.value.length ? allCartridges.value : cartridges.value;
  const found = lookupList.find(c => c.barcode === code);
  if (found && canSelectForBatch(found)) {
    if (!selectedIds.value.includes(found.id)) {
      selectedIds.value.push(found.id);
      // Ensure found cartridge is in display list
      if (!cartridges.value.find(c => c.id === found.id)) {
        cartridges.value.push(found);
      }
      lastScanResult.value = `✓ ${found.name}`;
      lastScanFlash.value = true;
      setTimeout(() => lastScanFlash.value = false, 800);
    } else {
      lastScanResult.value = `⚠ ${found.name} — уже в списке`;
    }
  } else if (found) {
    lastScanResult.value = `✗ ${found.name} — нельзя выбрать`;
  } else {
    lastScanResult.value = `✗ ШК "${code}" не найден`;
  }
  batchScanValue.value = '';
  nextTick(() => batchScanInput.value?.focus());
}

function handleBatchScanKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (batchScanValue.value) addByBarcode(batchScanValue.value);
  }
}

function openAddModal() {
  showAddModal.value = true;
  newCartridge.value = { name: '', barcode: '', type_id: '', status_id: '', location: '', notes: '' };
  addError.value = '';
  setTimeout(() => addBarcodeInput.value?.focus(), 100);
}

async function addCartridge() {
  addError.value = '';
  if (!newCartridge.value.name || !newCartridge.value.barcode || !newCartridge.value.type_id || !newCartridge.value.status_id) {
    addError.value = 'Заполните обязательные поля';
    return;
  }
  try {
    await api.post('/cartridges', {
      ...newCartridge.value,
      type_id: Number(newCartridge.value.type_id),
      status_id: Number(newCartridge.value.status_id)
    });
    showAddModal.value = false;
    await load();
  } catch (e) {
    addError.value = e.response?.data?.error || 'Ошибка добавления';
  }
}

function startBatch() {
  batchMode.value = true;
  selectedIds.value = [];
  batchStatusId.value = auth.isAdmin ? '' : refillStatusId.value;
  batchError.value = '';
  batchSuccess.value = '';
  lastScanResult.value = '';
  batchScanValue.value = '';
  filterStatus.value = '';
  filterUser.value = '';
  loading.value = true;
  loadAllForBatch().then(() => {
    nextTick(() => batchScanInput.value?.focus());
  });
}

function cancelBatch() {
  batchMode.value = false;
  selectedIds.value = [];
  batchError.value = '';
  batchSuccess.value = '';
  lastScanResult.value = '';
  filterStatus.value = '';
  filterUser.value = '';
  load();
}

async function applyBatch() {
  batchError.value = '';
  batchSuccess.value = '';
  if (!selectedIds.value.length) { batchError.value = 'Выберите картриджи'; return; }
  if (!batchStatusId.value) { batchError.value = 'Выберите новый статус'; return; }

  try {
    const { data } = await api.post('/cartridge-movements/batch-move', {
      cartridge_ids: selectedIds.value,
      to_status_id: Number(batchStatusId.value)
    });
    batchSuccess.value = `Статус изменён для ${data.count} картриджей`;
    selectedIds.value = [];
    batchStatusId.value = auth.isAdmin ? '' : refillStatusId.value;
    lastScanResult.value = '';
    await load();
  } catch (e) {
    batchError.value = e.response?.data?.error || 'Ошибка пакетной смены';
  }
}

function resetFilters() {
  search.value = ''; filterStatus.value = ''; filterUser.value = '';
  load();
}

onMounted(() => { load(); setTimeout(() => barcodeInput.value?.focus(), 300); });
</script>

<template>
  <div>
    <div class="top-bar">
      <h1><i class="bi bi-printer"></i> Картриджи</h1>
      <div class="d-flex gap-2">
        <button v-if="!batchMode" class="btn btn-outline-secondary btn-sm" @click="showFilters = !showFilters">
          <i class="bi bi-funnel"></i> Фильтры
        </button>
        <button v-if="!batchMode && auth.isAdmin" class="btn btn-primary btn-sm" @click="openAddModal">
          <i class="bi bi-plus-lg"></i> Добавить
        </button>
        <button v-if="!batchMode" class="btn btn-warning btn-sm" @click="startBatch">
          <i class="bi bi-arrow-left-right"></i> Пакетная смены статуса
        </button>
        <button v-if="batchMode" class="btn btn-secondary btn-sm" @click="cancelBatch">
          <i class="bi bi-x-lg"></i> Отмена
        </button>
      </div>
    </div>

    <!-- Batch mode panel -->
    <div v-if="batchMode" class="card mb-3 border-warning">
      <div class="card-body py-2">
        <h6 class="mb-2"><i class="bi bi-arrow-left-right"></i> Пакетная смены статуса</h6>

        <!-- Batch filters: narrow the table below by owner and status -->
        <div class="row g-2 mb-2">
          <div class="col-sm-6">
            <label class="form-label small">Владелец</label>
            <select v-model="filterUser" class="form-select form-select-sm">
              <option value="">Все</option>
              <option v-for="u in refs.users" :key="u.id" :value="u.id">{{ u.full_name }}</option>
            </select>
          </div>
          <div class="col-sm-6">
            <label class="form-label small">Статус</label>
            <select v-model="filterStatus" class="form-select form-select-sm">
              <option value="">Все</option>
              <option v-for="s in refs.cartridgeStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
        </div>

        <div v-if="batchSuccess" class="alert alert-success small py-2 mb-2">
          <i class="bi bi-check-circle"></i> {{ batchSuccess }}
        </div>
        <div v-if="batchError" class="alert alert-danger small py-2 mb-2">{{ batchError }}</div>

        <!-- Counter -->
        <div class="d-flex align-items-center gap-3 mb-2">
          <div class="batch-counter" :class="{ flash: lastScanFlash }">
            <i class="bi bi-check2-circle"></i> {{ selectedIds.length }}
          </div>
          <div v-if="lastScanResult" class="small fw-medium" :class="lastScanResult.startsWith('✓') ? 'text-success' : lastScanResult.startsWith('⚠') ? 'text-warning' : 'text-danger'">
            {{ lastScanResult }}
          </div>
        </div>

        <!-- Scanner input — separate field, auto-focus, clear after each scan -->
        <div class="input-group input-group-sm mb-2">
          <span class="input-group-text"><i class="bi bi-upc-scan"></i></span>
          <input ref="batchScanInput" v-model="batchScanValue" @keydown="handleBatchScanKeydown"
                 class="form-control" placeholder="Сканируйте ШК — поле очищается после каждого сканирования">
          <button class="btn btn-outline-primary" @click="showBatchScanner = true"><i class="bi bi-camera"></i></button>
        </div>
        <BarcodeScanner v-if="showBatchScanner" @scan="onScan" @close="showBatchScanner = false" />

        <!-- Selected list -->
        <div v-if="selectedCartridges.length" class="mb-2">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <strong class="small">Выбрано: {{ selectedCartridges.length }}</strong>
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-outline-secondary" @click="selectAll">Выбрать все доступные</button>
              <button class="btn btn-sm btn-outline-danger" @click="clearSelection">Очистить</button>
            </div>
          </div>
          <div class="batch-list">
            <div v-for="(c, i) in selectedCartridges" :key="c.id" class="batch-item d-flex justify-content-between align-items-center">
              <div>
                <span class="badge bg-primary me-1">{{ i + 1 }}</span>
                <span class="font-monospace small text-primary">{{ c.barcode }}</span>
                <span class="fw-medium small ms-1">{{ c.name }}</span>
              </div>
              <button class="btn btn-sm btn-outline-danger py-0" @click="toggleSelect(c)"><i class="bi bi-x"></i></button>
            </div>
          </div>
        </div>
        <div v-else class="text-muted small mb-2">Сканируйте ШК или выберите картриджи из списка ниже</div>

        <!-- Status selector -->
        <div class="row g-2 mb-2">
          <div class="col-12">
            <label class="form-label small">Новый статус</label>
            <select v-model="batchStatusId" class="form-select form-select-sm">
              <option v-if="auth.isAdmin" value="">Выберите статус</option>
              <option v-if="!auth.isAdmin" :value="refillStatusId">Отдали на заправку</option>
              <template v-if="auth.isAdmin">
                <option v-for="s in refs.cartridgeStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
              </template>
            </select>
          </div>
        </div>
        <button class="btn btn-warning btn-sm w-100" @click="applyBatch" :disabled="!selectedIds.length || !batchStatusId">
          <i class="bi bi-check-lg"></i> Готово — изменить статус ({{ selectedIds.length }} картриджей)
        </button>
      </div>
    </div>

    <!-- Barcode scanner (normal mode) -->
    <div v-if="!batchMode" class="card mb-3 border-primary border-opacity-25">
      <div class="card-body py-3">
        <div class="row g-2 align-items-center">
          <div class="col-auto"><i class="bi bi-upc-scan fs-2 text-primary"></i></div>
          <div class="col">
            <label class="form-label small fw-medium mb-1">Сканируйте штрих-код</label>
            <div class="input-group">
              <input ref="barcodeInput" v-model="search" @keydown="handleBarcodeKeydown" @input="debouncedSearch" type="text"
                     class="form-control form-control-lg" placeholder="Наведите сканер или нажмите 📷">
              <button class="btn btn-outline-primary btn-lg" @click="showScanner = true"><i class="bi bi-camera"></i></button>
            </div>
          </div>
          <div class="col-auto" v-if="search">
            <button class="btn btn-outline-secondary" @click="resetFilters"><i class="bi bi-x-lg"></i></button>
          </div>
        </div>
      </div>
    </div>
    <BarcodeScanner v-if="showScanner" @scan="onScan" @close="showScanner = false" />

    <!-- Filters -->
    <div v-if="!batchMode && showFilters" class="card mb-3 filter-bar">
      <div class="card-body py-2">
        <div class="row g-2">
          <div class="col-md-3">
            <label class="form-label small">Статус</label>
            <select v-model="filterStatus" @change="load" class="form-select form-select-sm">
              <option value="">Все</option>
              <option v-for="s in refs.cartridgeStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small">Владелец</label>
            <select v-model="filterUser" @change="load" class="form-select form-select-sm">
              <option value="">Все</option>
              <option v-for="u in refs.users" :key="u.id" :value="u.id">{{ u.full_name }}</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- Desktop: table -->
    <div class="card p-0 overflow-hidden d-none d-md-block">
      <div class="table-responsive">
        <table class="table table-hover mb-0">
          <thead>
            <tr>
              <th v-if="batchMode" style="width:40px"></th>
              <th>Штрих-код</th>
              <th>Название</th>
              <th>Тип</th>
              <th>Статус</th>
              <th>Владелец</th>
              <th>Расположение</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading"><td :colspan="batchMode ? 7 : 6" class="text-center py-5"><div class="spinner-border text-primary"></div></td></tr>
            <tr v-else-if="!visibleCartridges.length"><td :colspan="batchMode ? 7 : 6" class="text-center py-5 text-muted">Картриджи не найдены</td></tr>
            <tr v-for="item in visibleCartridges" :key="item.id"
                :class="{ 'table-active': selectedIds.includes(item.id) }"
                @click="batchMode ? toggleSelect(item) : $router.push(`/cartridges/${item.id}`)"
                style="cursor:pointer">
              <td v-if="batchMode">
                <input type="checkbox" class="form-check-input"
                       :checked="selectedIds.includes(item.id)"
                       :disabled="!canSelectForBatch(item)"
                       @click.stop="toggleSelect(item)">
              </td>
              <td class="font-monospace small">{{ item.barcode }}</td>
              <td class="fw-medium">{{ item.name }}</td>
              <td>{{ item.type_name }}</td>
              <td><span class="status-badge" :style="{ background: item.status_color }">{{ item.status_name }}</span></td>
              <td>{{ item.assigned_user_name || '—' }}</td>
              <td><small>{{ item.location || '—' }}</small></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Mobile: cards -->
    <div class="d-block d-md-none">
      <div v-if="loading" class="text-center py-5"><div class="spinner-border text-primary"></div></div>
      <div v-else-if="!visibleCartridges.length" class="text-center py-5 text-muted">Картриджи не найдены</div>
      <div v-for="item in visibleCartridges" :key="item.id"
           class="equip-card mb-2"
           :class="{ 'border-warning border-2': selectedIds.includes(item.id) }"
           @click="batchMode ? toggleSelect(item) : $router.push(`/cartridges/${item.id}`)">
        <div v-if="batchMode" class="d-flex justify-content-between align-items-start mb-1">
          <div>
            <input type="checkbox" class="form-check-input me-2"
                   :checked="selectedIds.includes(item.id)"
                   :disabled="!canSelectForBatch(item)">
            <span class="fw-medium text-truncate">{{ item.name }}</span>
          </div>
        </div>
        <div v-if="!batchMode" class="d-flex justify-content-between align-items-start mb-2">
          <span class="fw-medium text-truncate" style="max-width:70%">{{ item.name }}</span>
          <span class="status-badge" :style="{ background: item.status_color }">{{ item.status_name }}</span>
        </div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <i class="bi bi-upc-scan text-primary small"></i>
          <span class="font-monospace small">{{ item.barcode }}</span>
        </div>
        <div v-if="!batchMode" class="d-flex flex-wrap gap-2 small text-muted">
          <span v-if="item.type_name"><i class="bi bi-tag"></i> {{ item.type_name }}</span>
          <span v-if="item.assigned_user_name"><i class="bi bi-person"></i> {{ item.assigned_user_name }}</span>
          <span v-if="item.location"><i class="bi bi-geo-alt"></i> {{ item.location }}</span>
        </div>
      </div>
    </div>

    <!-- Add Modal -->
    <div v-if="showAddModal" class="modal show d-block" style="background:rgba(0,0,0,0.5)" @click.self="showAddModal = false">
      <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content">
          <div class="modal-header py-2">
            <h6 class="modal-title">Добавить картридж</h6>
            <button type="button" class="btn-close" @click="showAddModal = false"></button>
          </div>
          <div class="modal-body">
            <div v-if="addError" class="alert alert-danger small py-2">{{ addError }}</div>
            <div class="row g-3">
              <div class="col-12">
                <label class="form-label small"><i class="bi bi-upc-scan"></i> Штрих-код *</label>
                <div class="input-group input-group-sm">
                  <input ref="addBarcodeInput" v-model="newCartridge.barcode" class="form-control" required placeholder="Отсканируйте или введите">
                  <button class="btn btn-outline-primary" @click="showAddScanner = true"><i class="bi bi-camera"></i></button>
                </div>
                <BarcodeScanner v-if="showAddScanner" @scan="onScan" @close="showAddScanner = false" />
              </div>
              <div class="col-12">
                <label class="form-label small">Название *</label>
                <input v-model="newCartridge.name" class="form-control form-control-sm" required>
              </div>
              <div class="col-6">
                <label class="form-label small">Тип *</label>
                <select v-model="newCartridge.type_id" class="form-select form-select-sm" required>
                  <option value="">Выберите</option>
                  <option v-for="t in refs.equipmentTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
              </div>
              <div class="col-6">
                <label class="form-label small">Статус *</label>
                <select v-model="newCartridge.status_id" class="form-select form-select-sm" required>
                  <option value="">Выберите</option>
                  <option v-for="s in refs.cartridgeStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
              <div class="col-6">
                <label class="form-label small">Расположение</label>
                <input v-model="newCartridge.location" class="form-control form-control-sm">
              </div>
              <div class="col-12">
                <label class="form-label small">Примечание</label>
                <textarea v-model="newCartridge.notes" class="form-control form-control-sm" rows="2"></textarea>
              </div>
            </div>
          </div>
          <div class="modal-footer py-2">
            <button class="btn btn-secondary btn-sm" @click="showAddModal = false">Отмена</button>
            <button class="btn btn-primary btn-sm" @click="addCartridge">Добавить</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.batch-counter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 1.5rem;
  font-weight: 700;
  color: #fd7e14;
  transition: transform 0.15s;
}
.batch-counter.flash {
  transform: scale(1.4);
  color: #198754;
}
.batch-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 8px;
  background: #f8f9fa;
}
.batch-item {
  padding: 4px 8px;
  border-bottom: 1px solid #e9ecef;
}
.batch-item:last-child {
  border-bottom: none;
}
</style>