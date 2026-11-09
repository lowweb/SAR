<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../api';
import { useReferencesStore } from '../stores/references';
import { useAuthStore } from '../stores/auth';
import BarcodeDisplay from '../components/BarcodeDisplay.vue';
import BarcodeScanner from '../components/BarcodeScanner.vue';

const route = useRoute();
const refs = useReferencesStore();
const auth = useAuthStore();

const cartridge = ref(null);
const history = ref([]);
const loading = ref(true);
const editMode = ref(false);
const editData = ref({});
const showEditScanner = ref(false);
const showMove = ref(false);
const moveData = ref({ to_user_id: '', to_status_id: '', to_location: '', comment: '' });
const error = ref('');

const hSortKey = ref('moved_at');
const hSortDir = ref('desc');

function toggleHSort(key) {
  if (hSortKey.value === key) { hSortDir.value = hSortDir.value === 'asc' ? 'desc' : 'asc'; }
  else { hSortKey.value = key; hSortDir.value = 'asc'; }
}

function hSortIcon(key) {
  if (hSortKey.value !== key) return 'bi-arrow-down-up';
  return hSortDir.value === 'asc' ? 'bi-arrow-up' : 'bi-arrow-down';
}

const sortedHistory = computed(() => {
  const list = [...history.value];
  const dir = hSortDir.value === 'asc' ? 1 : -1;
  return list.sort((a, b) => {
    let va = a[hSortKey.value] || '';
    let vb = b[hSortKey.value] || '';
    if (hSortKey.value === 'moved_at') {
      va = new Date(va).getTime(); vb = new Date(vb).getTime();
      return (va - vb) * dir;
    }
    return String(va).localeCompare(String(vb), 'ru') * dir;
  });
});

const isRefill = computed(() => {
  if (!cartridge.value) return false;
  return cartridge.value.status_name === 'Отдали на заправку';
});

const canMove = computed(() => {
  if (!cartridge.value) return false;
  if (auth.isAdmin) return true;
  return !isRefill.value;
});

async function load() {
  loading.value = true;
  try {
    await refs.loadAll();
    const [c, h] = await Promise.all([
      api.get(`/cartridges/${route.params.id}`),
      api.get('/cartridge-movements', { params: { cartridge_id: route.params.id } })
    ]);
    cartridge.value = c.data;
    history.value = h.data;
  } finally {
    loading.value = false;
  }
}

function startEdit() {
  editData.value = { ...cartridge.value };
  editMode.value = true;
}

function onEditScan(code) {
  editData.value.barcode = code;
  showEditScanner.value = false;
}

async function saveEdit() {
  error.value = '';
  try {
    await api.put(`/cartridges/${cartridge.value.id}`, {
      name: editData.value.name,
      barcode: editData.value.barcode,
      type_id: Number(editData.value.type_id),
      status_id: Number(editData.value.status_id),
      assigned_user_id: editData.value.assigned_user_id ? Number(editData.value.assigned_user_id) : null,
      location: editData.value.location,
      notes: editData.value.notes
    });
    editMode.value = false;
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка сохранения';
  }
}

async function moveCartridge() {
  error.value = '';
  const refillId = refs.getRefillStatusId();

  // User check: only "Отдали на заправку"
  if (auth.user.role !== 'admin') {
    if (!moveData.value.to_status_id || Number(moveData.value.to_status_id) !== refillId) {
      error.value = 'Вы можете перемещать картриджи только в статус «Отдали на заправку»';
      return;
    }
  }

  try {
    await api.post('/cartridge-movements/move', {
      cartridge_id: cartridge.value.id,
      to_user_id: moveData.value.to_user_id ? Number(moveData.value.to_user_id) : undefined,
      to_status_id: moveData.value.to_status_id ? Number(moveData.value.to_status_id) : undefined,
      to_location: moveData.value.to_location || undefined,
      comment: moveData.value.comment
    });
    showMove.value = false;
    moveData.value = { to_user_id: '', to_status_id: '', to_location: '', comment: '' };
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка перемещения';
  }
}

async function deleteCartridge() {
  if (!confirm('Удалить картридж?')) return;
  await api.delete(`/cartridges/${cartridge.value.id}`);
  window.history.back();
}

onMounted(load);
</script>

<template>
  <div v-if="!loading && cartridge">
    <div class="top-bar">
      <h1 class="d-flex align-items-center gap-2">
        <button class="btn btn-sm btn-outline-secondary" @click="$router.back()"><i class="bi bi-arrow-left"></i></button>
        {{ cartridge.name }}
      </h1>
      <div class="d-flex gap-2">
        <button v-if="auth.isAdmin" class="btn btn-outline-primary btn-sm" @click="startEdit"><i class="bi bi-pencil"></i> Редактировать</button>
        <button v-if="canMove" class="btn btn-warning btn-sm" @click="showMove = true"><i class="bi bi-arrow-left-right"></i> Переместить</button>
        <span v-if="!canMove && !auth.isAdmin" class="badge bg-warning text-dark py-2">
          <i class="bi bi-lock"></i> На заправке — перемещение только администратором
        </span>
        <button v-if="auth.isAdmin" class="btn btn-danger btn-sm" @click="deleteCartridge"><i class="bi bi-trash"></i> Удалить</button>
      </div>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div class="row g-4 mb-4">
      <div class="col-md-8">
        <div class="card p-4">
          <template v-if="!editMode">
            <div class="row">
              <div class="col-md-6">
                <dl class="row mb-0">
                  <dt class="col-sm-5 small text-muted">Штрих-код</dt>
                  <dd class="col-sm-7 font-monospace">{{ cartridge.barcode }}</dd>
                  <dt class="col-sm-5 small text-muted">Тип</dt>
                  <dd class="col-sm-7">{{ cartridge.type_name }}</dd>
                  <dt class="col-sm-5 small text-muted">Статус</dt>
                  <dd class="col-sm-7"><span class="status-badge" :style="{ background: cartridge.status_color }">{{ cartridge.status_name }}</span></dd>
                </dl>
              </div>
              <div class="col-md-6">
                <dl class="row mb-0">
                  <dt class="col-sm-5 small text-muted">Владелец</dt>
                  <dd class="col-sm-7">{{ cartridge.assigned_user_name || 'Не назначен' }}</dd>
                  <dt class="col-sm-5 small text-muted">Расположение</dt>
                  <dd class="col-sm-7">{{ cartridge.location || '—' }}</dd>
                  <dt class="col-sm-5 small text-muted">Создано</dt>
                  <dd class="col-sm-7 small">{{ new Date(cartridge.created_at).toLocaleDateString('ru-RU') }}</dd>
                </dl>
              </div>
            </div>
            <div v-if="cartridge.notes" class="mt-3 p-2 bg-light rounded small"><strong>Примечание:</strong> {{ cartridge.notes }}</div>
          </template>
          <template v-else>
            <div class="row g-3">
              <div class="col-12"><label class="form-label small">Название</label><input v-model="editData.name" class="form-control form-control-sm"></div>
              <div class="col-6">
                <label class="form-label small"><i class="bi bi-upc-scan"></i> Штрих-код</label>
                <div class="input-group input-group-sm">
                  <input v-model="editData.barcode" class="form-control">
                  <button class="btn btn-outline-primary" @click="showEditScanner = true"><i class="bi bi-camera"></i></button>
                </div>
                <BarcodeScanner v-if="showEditScanner" @scan="onEditScan" @close="showEditScanner = false" />
              </div>
              <div class="col-6"><label class="form-label small">Тип</label>
                <select v-model="editData.type_id" class="form-select form-select-sm">
                  <option v-for="t in refs.equipmentTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
              </div>
              <div class="col-6"><label class="form-label small">Статус</label>
                <select v-model="editData.status_id" class="form-select form-select-sm">
                  <option v-for="s in refs.cartridgeStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
              <div class="col-6"><label class="form-label small">Владелец</label>
                <select v-model="editData.assigned_user_id" class="form-select form-select-sm">
                  <option :value="null">Не назначен</option>
                  <option v-for="u in refs.users" :key="u.id" :value="u.id">{{ u.full_name }}</option>
                </select>
              </div>
              <div class="col-6"><label class="form-label small">Расположение</label><input v-model="editData.location" class="form-control form-control-sm"></div>
              <div class="col-12"><label class="form-label small">Примечание</label><textarea v-model="editData.notes" class="form-control form-control-sm" rows="2"></textarea></div>
            </div>
            <div class="mt-3 d-flex gap-2">
              <button class="btn btn-primary btn-sm" @click="saveEdit">Сохранить</button>
              <button class="btn btn-secondary btn-sm" @click="editMode = false">Отмена</button>
            </div>
          </template>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card p-4 text-center">
          <BarcodeDisplay :value="cartridge.barcode" :height="60" :width="2" :font-size="16" />
        </div>
      </div>
    </div>

    <h5 class="mb-3"><i class="bi bi-clock-history"></i> История перемещений</h5>
    <!-- Desktop: table -->
    <div class="card p-0 overflow-hidden d-none d-md-block">
      <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
          <thead><tr><th class="sortable" @click="toggleHSort('moved_at')">Дата <i :class="hSortIcon('moved_at')"></i></th><th>Откуда</th><th>Куда</th><th>Комментарий</th></tr></thead>
          <tbody>
            <tr v-if="!sortedHistory.length"><td colspan="4" class="text-center text-muted py-3">Нет записей</td></tr>
            <tr v-for="m in sortedHistory" :key="m.id">
              <td class="small">{{ new Date(m.moved_at).toLocaleString('ru-RU') }}</td>
              <td class="small">
                <div>{{ m.from_user_name || '—' }}</div>
                <div v-if="m.from_status_name"><span class="badge bg-light text-dark">{{ m.from_status_name }}</span></div>
              </td>
              <td class="small">
                <div>{{ m.to_user_name || '—' }}</div>
                <div v-if="m.to_status_name"><span class="badge bg-light text-dark">{{ m.to_status_name }}</span></div>
              </td>
              <td class="small">{{ m.comment || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <!-- Mobile: cards -->
    <div class="d-block d-md-none">
      <div v-if="!sortedHistory.length" class="text-center py-3 text-muted">Нет записей</div>
      <div v-for="m in sortedHistory" :key="m.id" class="move-card mb-2">
        <div class="small text-muted mb-2"><i class="bi bi-calendar"></i> {{ new Date(m.moved_at).toLocaleString('ru-RU') }}</div>
        <div class="move-card-path">
          <div class="move-card-from">
            <div class="small text-muted mb-1"><i class="bi bi-arrow-left-circle"></i> Откуда</div>
            <div class="fw-medium small">{{ m.from_user_name || '—' }}</div>
            <span v-if="m.from_status_name" class="badge bg-light text-dark small">{{ m.from_status_name }}</span>
            <div v-if="m.from_location" class="text-muted" style="font-size:.75rem">{{ m.from_location }}</div>
          </div>
          <div class="move-card-arrow"><i class="bi bi-arrow-right"></i></div>
          <div class="move-card-to">
            <div class="small text-muted mb-1"><i class="bi bi-arrow-right-circle"></i> Куда</div>
            <div class="fw-medium small">{{ m.to_user_name || '—' }}</div>
            <span v-if="m.to_status_name" class="badge bg-light text-dark small">{{ m.to_status_name }}</span>
            <div v-if="m.to_location" class="text-muted" style="font-size:.75rem">{{ m.to_location }}</div>
          </div>
        </div>
        <div v-if="m.comment" class="mt-2 small text-muted border-top pt-2"><i class="bi bi-chat-text"></i> {{ m.comment }}</div>
      </div>
    </div>

    <!-- Move Modal -->
    <div v-if="showMove" class="modal show d-block" style="background:rgba(0,0,0,0.5)" @click.self="showMove = false">
      <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content">
          <div class="modal-header py-2">
            <h6 class="modal-title">Переместить картридж</h6>
            <button type="button" class="btn-close" @click="showMove = false"></button>
          </div>
          <div class="modal-body">
            <div v-if="error" class="alert alert-danger small py-2">{{ error }}</div>
            <div class="g-2 d-flex flex-column gap-2">
              <div v-if="auth.isAdmin">
                <label class="form-label small">Новый пользователь</label>
                <select v-model="moveData.to_user_id" class="form-select form-select-sm">
                  <option :value="''">Без изменений</option>
                  <option v-for="u in refs.users" :key="u.id" :value="u.id">{{ u.full_name }}</option>
                </select>
              </div>
              <div>
                <label class="form-label small">Новый статус</label>
                <select v-model="moveData.to_status_id" class="form-select form-select-sm">
                  <option :value="''">Без изменений</option>
                  <option v-if="auth.user.role !== 'admin'" :value="refs.getRefillStatusId()">Отдали на заправку</option>
                  <template v-if="auth.isAdmin">
                    <option v-for="s in refs.cartridgeStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
                  </template>
                </select>
              </div>
              <div v-if="auth.isAdmin">
                <label class="form-label small">Новое расположение</label>
                <input v-model="moveData.to_location" class="form-control form-control-sm" :placeholder="cartridge.location || '—'">
              </div>
              <div>
                <label class="form-label small">Комментарий</label>
                <textarea v-model="moveData.comment" class="form-control form-control-sm" rows="2"></textarea>
              </div>
            </div>
          </div>
          <div class="modal-footer py-2">
            <button class="btn btn-secondary btn-sm" @click="showMove = false">Отмена</button>
            <button class="btn btn-warning btn-sm" @click="moveCartridge">Переместить</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
