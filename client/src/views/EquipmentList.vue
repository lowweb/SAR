<script setup>
import { ref, onMounted, computed } from 'vue';
import api from '../api';
import { useReferencesStore } from '../stores/references';
import { useAuthStore } from '../stores/auth';
import BarcodeDisplay from '../components/BarcodeDisplay.vue';
import BarcodeScanner from '../components/BarcodeScanner.vue';

const refs = useReferencesStore();
const auth = useAuthStore();

const equipment = ref([]);
const loading = ref(true);
const search = ref('');
const filterType = ref('');
const filterStatus = ref('');
const filterLocation = ref('');
const filterUser = ref('');
const showFilters = ref(false);
let searchTimer = null;

const showAddModal = ref(false);
const showScanner = ref(false);
const showAddScanner = ref(false);
const newEquip = ref({ name: '', serial_number: '', inventory_number: '', barcode: '', type_id: '', status_id: '', location: '', notes: '' });
const addError = ref('');

const barcodeInput = ref(null);
const addBarcodeInput = ref(null);

async function load() {
  loading.value = true;
  try {
    await refs.loadAll();
    const params = {
      search: search.value || undefined,
      type_id: filterType.value || undefined,
      status_id: filterStatus.value || undefined,
      location: filterLocation.value || undefined,
      user_id: auth.isAdmin && filterUser.value ? filterUser.value : undefined
    };
    const { data } = await api.get('/equipment', { params });
    equipment.value = data;
  } finally {
    loading.value = false;
  }
}

function focusBarcode() {
  search.value = '';
  filterType.value = '';
  filterStatus.value = '';
  filterLocation.value = '';
  filterUser.value = '';
  showFilters.value = false;
  load();
}

function handleBarcodeKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    clearTimeout(searchTimer);
    load();
  }
}

function debouncedSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 300);
}

function onScan(code) {
  search.value = code;
  showScanner.value = false;
  showAddScanner.value = false;
  if (showAddModal.value) {
    newEquip.value.barcode = code;
  } else {
    clearTimeout(searchTimer);
    load();
  }
}

async function addEquipment() {
  addError.value = '';
  if (!newEquip.value.name || !newEquip.value.barcode || !newEquip.value.type_id || !newEquip.value.status_id) {
    addError.value = 'Заполните обязательные поля';
    return;
  }
  try {
    await api.post('/equipment', {
      ...newEquip.value,
      type_id: Number(newEquip.value.type_id),
      status_id: Number(newEquip.value.status_id),
      assigned_user_id: newEquip.value.assigned_user_id ? Number(newEquip.value.assigned_user_id) : undefined
    });
    showAddModal.value = false;
    newEquip.value = { name: '', serial_number: '', inventory_number: '', barcode: '', type_id: '', status_id: '', location: '', notes: '' };
    await load();
  } catch (e) {
    addError.value = e.response?.data?.error || 'Ошибка добавления';
  }
}

function openAddModal() {
  showAddModal.value = true;
  newEquip.value = { name: '', serial_number: '', inventory_number: '', barcode: '', type_id: '', status_id: '', location: '', notes: '' };
  addError.value = '';
  setTimeout(() => {
    addBarcodeInput.value?.focus();
  }, 100);
}

function resetFilters() {
  search.value = '';
  filterType.value = '';
  filterStatus.value = '';
  filterLocation.value = '';
  filterUser.value = '';
  load();
}

onMounted(() => {
  load();
  setTimeout(() => barcodeInput.value?.focus(), 300);
});
</script>

<template>
  <div>
    <div class="top-bar">
      <h1><i class="bi bi-pc-display"></i> Оборудование</h1>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-secondary btn-sm" @click="showFilters = !showFilters">
          <i class="bi bi-funnel"></i> Фильтры
        </button>
        <button class="btn btn-primary btn-sm" @click="openAddModal">
          <i class="bi bi-plus-lg"></i> Добавить
        </button>
      </div>
    </div>

    <!-- Barcode scanner input -->
    <div class="card mb-3 border-primary border-opacity-25">
      <div class="card-body py-3">
        <div class="row g-2 align-items-center">
          <div class="col-auto">
            <i class="bi bi-upc-scan fs-2 text-primary"></i>
          </div>
          <div class="col">
            <label class="form-label small fw-medium mb-1">Сканируйте штрих-код</label>
            <div class="input-group">
              <input ref="barcodeInput" v-model="search" @keydown="handleBarcodeKeydown" @input="debouncedSearch" type="text"
                     class="form-control form-control-lg" placeholder="Наведите сканер или нажмите 📷">
              <button class="btn btn-outline-primary btn-lg" @click="showScanner = true" title="Сканировать камерой">
                <i class="bi bi-camera"></i>
              </button>
            </div>
          </div>
          <div class="col-auto" v-if="search">
            <button class="btn btn-outline-secondary" @click="focusBarcode" title="Очистить">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <BarcodeScanner v-if="showScanner" @scan="onScan" @close="showScanner = false" />

    <div v-if="showFilters" class="filter-bar">
      <div class="row g-3">
        <div class="col-md-4">
          <label class="form-label small fw-medium">Поиск</label>
          <input v-model="search" @input="debouncedSearch" type="text" class="form-control form-control-sm" placeholder="Название, штрих-код...">
        </div>
        <div class="col-md-2">
          <label class="form-label small fw-medium">Тип</label>
          <select v-model="filterType" @change="load" class="form-select form-select-sm">
            <option value="">Все</option>
            <option v-for="t in refs.equipmentTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small fw-medium">Статус</label>
          <select v-model="filterStatus" @change="load" class="form-select form-select-sm">
            <option value="">Все</option>
            <option v-for="s in refs.equipmentStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small fw-medium">Расположение</label>
          <input v-model="filterLocation" @input="load" type="text" class="form-control form-control-sm" placeholder="...">
        </div>
        <div v-if="auth.isAdmin" class="col-md-2">
          <label class="form-label small fw-medium">Пользователь</label>
          <select v-model="filterUser" @change="load" class="form-select form-select-sm">
            <option value="">Все</option>
            <option v-for="u in refs.users" :key="u.id" :value="u.id">{{ u.full_name }}</option>
          </select>
        </div>
        <div class="col-md-2 d-flex align-items-end">
          <button class="btn btn-sm btn-outline-secondary w-100" @click="resetFilters">Сбросить</button>
        </div>
      </div>
    </div>

    <!-- Desktop: table -->
    <div class="card p-0 overflow-hidden d-none d-md-block">
      <div class="table-responsive">
        <table class="table table-hover mb-0">
          <thead>
            <tr>
              <th>#</th>
              <th>Штрих-код</th>
              <th>Инв. номер</th>
              <th>Название</th>
              <th>Тип</th>
              <th>Статус</th>
              <th>Владелец</th>
              <th>Расположение</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="8" class="text-center py-5">
                <div class="spinner-border text-primary"></div>
              </td>
            </tr>
            <tr v-else-if="!equipment.length">
              <td colspan="8" class="text-center py-5 text-muted">Оборудование не найдено</td>
            </tr>
            <tr v-for="item in equipment" :key="item.id" class="cursor-pointer" style="cursor:pointer"
                @click="$router.push(`/equipment/${item.id}`)">
              <td>{{ item.id }}</td>
              <td class="font-monospace small">{{ item.barcode }}</td>
              <td class="font-monospace small">{{ item.inventory_number || '—' }}</td>
              <td class="fw-medium">{{ item.name }}</td>
              <td>{{ item.type_name }}</td>
              <td>
                <span class="status-badge" :style="{ background: item.status_color }">
                  {{ item.status_name }}
                </span>
              </td>
              <td>{{ item.assigned_user_name || '—' }}</td>
              <td><small>{{ item.location || '—' }}</small></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Mobile: cards -->
    <div class="d-block d-md-none">
      <div v-if="loading" class="text-center py-5">
        <div class="spinner-border text-primary"></div>
      </div>
      <div v-else-if="!equipment.length" class="text-center py-5 text-muted">
        Оборудование не найдено
      </div>
      <div v-for="item in equipment" :key="item.id"
           class="equip-card mb-2" @click="$router.push(`/equipment/${item.id}`)">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <span class="fw-medium text-truncate" style="max-width:70%">{{ item.name }}</span>
          <span class="status-badge" :style="{ background: item.status_color }">
            {{ item.status_name }}
          </span>
        </div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <i class="bi bi-upc-scan text-primary small"></i>
          <span class="font-monospace small">{{ item.barcode }}</span>
        </div>
        <div class="d-flex flex-wrap gap-2 small text-muted">
          <span v-if="item.inventory_number"><i class="bi bi-hash"></i> {{ item.inventory_number }}</span>
          <span v-if="item.type_name"><i class="bi bi-tag"></i> {{ item.type_name }}</span>
          <span v-if="item.assigned_user_name"><i class="bi bi-person"></i> {{ item.assigned_user_name }}</span>
          <span v-if="item.location"><i class="bi bi-geo-alt"></i> {{ item.location }}</span>
        </div>
      </div>
    </div>

    <!-- Add Modal -->
    <div v-if="showAddModal" class="modal show d-block" style="background:rgba(0,0,0,0.5)" @click.self="showAddModal = false">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Добавить оборудование</h5>
            <button type="button" class="btn-close" @click="showAddModal = false"></button>
          </div>
          <div class="modal-body">
            <div v-if="addError" class="alert alert-danger small py-2">{{ addError }}</div>
            <div class="row g-3">
              <div class="col-12">
                <label class="form-label small">
                  <i class="bi bi-upc-scan"></i> Штрих-код *
                </label>
                <div class="input-group input-group-sm">
                  <input ref="addBarcodeInput" v-model="newEquip.barcode" class="form-control" required
                         placeholder="Отсканируйте или введите штрих-код">
                  <button class="btn btn-outline-primary" @click="showAddScanner = true" title="Сканировать камерой">
                    <i class="bi bi-camera"></i>
                  </button>
                </div>
                <BarcodeScanner v-if="showAddScanner" @scan="onScan" @close="showAddScanner = false" />
              </div>
              <div class="col-12">
                <label class="form-label small">Название *</label>
                <input v-model="newEquip.name" class="form-control form-control-sm" required>
              </div>
              <div class="col-6">
                <label class="form-label small">Серийный номер</label>
                <input v-model="newEquip.serial_number" class="form-control form-control-sm">
              </div>
              <div class="col-6">
                <label class="form-label small">Инвентарный номер</label>
                <input v-model="newEquip.inventory_number" class="form-control form-control-sm">
              </div>
              <div class="col-6">
                <label class="form-label small">Тип *</label>
                <select v-model="newEquip.type_id" class="form-select form-select-sm" required>
                  <option value="">Выберите</option>
                  <option v-for="t in refs.equipmentTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
              </div>
              <div class="col-6">
                <label class="form-label small">Статус *</label>
                <select v-model="newEquip.status_id" class="form-select form-select-sm" required>
                  <option value="">Выберите</option>
                  <option v-for="s in refs.equipmentStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
              <div class="col-6">
                <label class="form-label small">Расположение</label>
                <input v-model="newEquip.location" class="form-control form-control-sm">
              </div>
              <div v-if="auth.isAdmin" class="col-6">
                <label class="form-label small">Закрепить за</label>
                <select v-model="newEquip.assigned_user_id" class="form-select form-select-sm">
                  <option value="">Не закреплено</option>
                  <option v-for="u in refs.users" :key="u.id" :value="u.id">{{ u.full_name }}</option>
                </select>
              </div>
              <div class="col-12">
                <label class="form-label small">Примечание</label>
                <textarea v-model="newEquip.notes" class="form-control form-control-sm" rows="2"></textarea>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary btn-sm" @click="showAddModal = false">Отмена</button>
            <button class="btn btn-primary btn-sm" @click="addEquipment">Добавить</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
