<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../api';
import { useReferencesStore } from '../stores/references';
import { useAuthStore } from '../stores/auth';

const refs = useReferencesStore();
const auth = useAuthStore();

const records = ref([]);
const loading = ref(true);
const search = ref('');
const filterUser = ref('');
const filterStatus = ref('');
const filterType = ref('');
const filterDateFrom = ref('');
const filterDateTo = ref('');
const showFilters = ref(false);

// Edit state
const editRecord = ref(null);
const editData = ref({});
const editError = ref('');

const sortKey = ref('moved_at');
const sortDir = ref('desc');

function toggleSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = 'asc';
  }
}

function sortIcon(key) {
  if (sortKey.value !== key) return 'bi-arrow-down-up';
  return sortDir.value === 'asc' ? 'bi-arrow-up' : 'bi-arrow-down';
}

const sortedRecords = computed(() => {
  const list = [...records.value];
  const dir = sortDir.value === 'asc' ? 1 : -1;
  return list.sort((a, b) => {
    let va = a[sortKey.value] || '';
    let vb = b[sortKey.value] || '';
    if (sortKey.value === 'moved_at') {
      va = new Date(va).getTime();
      vb = new Date(vb).getTime();
      return (va - vb) * dir;
    }
    return String(va).localeCompare(String(vb), 'ru') * dir;
  });
});

async function load() {
  loading.value = true;
  try {
    await refs.loadAll();
    const params = {
      search: search.value || undefined,
      user_id: auth.isAdmin && filterUser.value ? filterUser.value : undefined,
      status_id: filterStatus.value || undefined,
      type_id: filterType.value || undefined,
      date_from: filterDateFrom.value || undefined,
      date_to: filterDateTo.value || undefined
    };
    const { data } = await api.get('/movements', { params });
    records.value = data;
  } finally {
    loading.value = false;
  }
}

function startEdit(record) {
  editRecord.value = record;
  editData.value = { ...record };
}

async function saveEdit() {
  editError.value = '';
  try {
    await api.put(`/movements/${editRecord.value.id}`, {
      from_user_id: editData.value.from_user_id ? Number(editData.value.from_user_id) : null,
      to_user_id: editData.value.to_user_id ? Number(editData.value.to_user_id) : null,
      from_status_id: editData.value.from_status_id ? Number(editData.value.from_status_id) : null,
      to_status_id: editData.value.to_status_id ? Number(editData.value.to_status_id) : null,
      from_location: editData.value.from_location || null,
      to_location: editData.value.to_location || null,
      comment: editData.value.comment || null,
      moved_at: editData.value.moved_at
    });
    editRecord.value = null;
    await load();
  } catch (e) {
    editError.value = e.response?.data?.error || 'Ошибка сохранения';
  }
}

async function deleteRecord(id) {
  if (!confirm('Удалить запись?')) return;
  await api.delete(`/movements/${id}`);
  await load();
}

function resetFilters() {
  search.value = '';
  filterUser.value = '';
  filterStatus.value = '';
  filterType.value = '';
  filterDateFrom.value = '';
  filterDateTo.value = '';
  load();
}

onMounted(load);
</script>

<template>
  <div>
    <div class="top-bar">
      <h1><i class="bi bi-clock-history"></i> История перемещений</h1>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-secondary btn-sm" @click="showFilters = !showFilters">
          <i class="bi bi-funnel"></i> Фильтры
        </button>
      </div>
    </div>

    <div v-if="showFilters" class="filter-bar">
      <div class="row g-3">
        <div class="col-md-3">
          <label class="form-label small fw-medium">Поиск</label>
          <input v-model="search" @input="load" type="text" class="form-control form-control-sm" placeholder="Оборудование, комментарий...">
        </div>
        <div v-if="auth.isAdmin" class="col-md-2">
          <label class="form-label small fw-medium">Пользователь</label>
          <select v-model="filterUser" @change="load" class="form-select form-select-sm">
            <option value="">Все</option>
            <option v-for="u in refs.users" :key="u.id" :value="u.id">{{ u.full_name }}</option>
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
          <label class="form-label small fw-medium">Тип</label>
          <select v-model="filterType" @change="load" class="form-select form-select-sm">
            <option value="">Все</option>
            <option v-for="t in refs.equipmentTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small fw-medium">Дата от</label>
          <input v-model="filterDateFrom" @change="load" type="date" class="form-control form-control-sm">
        </div>
        <div class="col-md-2">
          <label class="form-label small fw-medium">Дата до</label>
          <input v-model="filterDateTo" @change="load" type="date" class="form-control form-control-sm">
        </div>
        <div class="col-md-1 d-flex align-items-end">
          <button class="btn btn-sm btn-outline-secondary w-100" @click="resetFilters">Сброс</button>
        </div>
      </div>
    </div>

    <!-- Desktop: table -->
    <div class="card p-0 overflow-hidden d-none d-md-block">
      <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
          <thead>
            <tr>
              <th class="sortable" @click="toggleSort('moved_at')">Дата <i :class="sortIcon('moved_at')"></i></th>
              <th class="sortable" @click="toggleSort('equipment_name')">Оборудование <i :class="sortIcon('equipment_name')"></i></th>
              <th class="sortable" @click="toggleSort('barcode')">Штрих-код <i :class="sortIcon('barcode')"></i></th>
              <th>Откуда</th>
              <th>Куда</th>
              <th>Комментарий</th>
              <th v-if="auth.isAdmin">Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td :colspan="auth.isAdmin ? 7 : 6" class="text-center py-5">
                <div class="spinner-border text-primary"></div>
              </td>
            </tr>
            <tr v-else-if="!sortedRecords.length">
              <td :colspan="auth.isAdmin ? 7 : 6" class="text-center text-muted py-5">Записей нет</td>
            </tr>
            <tr v-for="r in sortedRecords" :key="r.id">
              <td class="small">{{ new Date(r.moved_at).toLocaleString('ru-RU') }}</td>
              <td class="small fw-medium">
                <router-link :to="`/equipment/${r.equipment_id}`" class="text-decoration-none">
                  {{ r.equipment_name }}
                </router-link>
              </td>
              <td class="small font-monospace">{{ r.barcode }}</td>
              <td class="small">
                <div>{{ r.from_user_name || '—' }}</div>
                <div v-if="r.from_status_name">
                  <span class="badge bg-light text-dark small">{{ r.from_status_name }}</span>
                </div>
                <div class="text-muted" style="font-size:.75rem">{{ r.from_location || '' }}</div>
              </td>
              <td class="small">
                <div>{{ r.to_user_name || '—' }}</div>
                <div v-if="r.to_status_name">
                  <span class="badge bg-light text-dark small">{{ r.to_status_name }}</span>
                </div>
                <div class="text-muted" style="font-size:.75rem">{{ r.to_location || '' }}</div>
              </td>
              <td class="small">{{ r.comment || '—' }}</td>
              <td v-if="auth.isAdmin" class="small">
                <button class="btn btn-sm btn-outline-secondary" @click="startEdit(r)">
                  <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" @click="deleteRecord(r.id)">
                  <i class="bi bi-trash"></i>
                </button>
              </td>
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
      <div v-else-if="!sortedRecords.length" class="text-center py-5 text-muted">Записей нет</div>
      <div v-for="r in sortedRecords" :key="r.id" class="move-card mb-2">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <router-link :to="`/equipment/${r.equipment_id}`" class="fw-medium text-decoration-none">
            {{ r.equipment_name }}
          </router-link>
          <small class="text-muted">{{ new Date(r.moved_at).toLocaleDateString('ru-RU') }}</small>
        </div>
        <div class="d-flex align-items-center gap-2 mb-2">
          <i class="bi bi-upc-scan text-primary small"></i>
          <span class="font-monospace small">{{ r.barcode }}</span>
        </div>
        <div class="move-card-path">
          <div class="move-card-from">
            <div class="small text-muted mb-1"><i class="bi bi-arrow-left-circle"></i> Откуда</div>
            <div class="fw-medium small">{{ r.from_user_name || '—' }}</div>
            <span v-if="r.from_status_name" class="badge bg-light text-dark small">{{ r.from_status_name }}</span>
            <div v-if="r.from_location" class="text-muted" style="font-size:.75rem">{{ r.from_location }}</div>
          </div>
          <div class="move-card-arrow"><i class="bi bi-arrow-right"></i></div>
          <div class="move-card-to">
            <div class="small text-muted mb-1"><i class="bi bi-arrow-right-circle"></i> Куда</div>
            <div class="fw-medium small">{{ r.to_user_name || '—' }}</div>
            <span v-if="r.to_status_name" class="badge bg-light text-dark small">{{ r.to_status_name }}</span>
            <div v-if="r.to_location" class="text-muted" style="font-size:.75rem">{{ r.to_location }}</div>
          </div>
        </div>
        <div v-if="r.comment" class="mt-2 small text-muted border-top pt-2">
          <i class="bi bi-chat-text"></i> {{ r.comment }}
        </div>
        <div v-if="auth.isAdmin" class="mt-2 d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary" @click="startEdit(r)">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" @click="deleteRecord(r.id)">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div v-if="editRecord" class="modal show d-block" style="background:rgba(0,0,0,0.5)" @click.self="editRecord = null">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Редактировать запись</h5>
            <button type="button" class="btn-close" @click="editRecord = null"></button>
          </div>
          <div class="modal-body">
            <div v-if="editError" class="alert alert-danger small py-2">{{ editError }}</div>
            <div class="row g-3">
              <div class="col-6">
                <label class="form-label small">Откуда (пользователь)</label>
                <select v-model="editData.from_user_id" class="form-select form-select-sm">
                  <option :value="null">—</option>
                  <option v-for="u in refs.users" :key="u.id" :value="u.id">{{ u.full_name }}</option>
                </select>
              </div>
              <div class="col-6">
                <label class="form-label small">Куда (пользователь)</label>
                <select v-model="editData.to_user_id" class="form-select form-select-sm">
                  <option :value="null">—</option>
                  <option v-for="u in refs.users" :key="u.id" :value="u.id">{{ u.full_name }}</option>
                </select>
              </div>
              <div class="col-6">
                <label class="form-label small">Откуда (статус)</label>
                <select v-model="editData.from_status_id" class="form-select form-select-sm">
                  <option :value="null">—</option>
                  <option v-for="s in refs.equipmentStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
              <div class="col-6">
                <label class="form-label small">Куда (статус)</label>
                <select v-model="editData.to_status_id" class="form-select form-select-sm">
                  <option :value="null">—</option>
                  <option v-for="s in refs.equipmentStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
              <div class="col-6">
                <label class="form-label small">Откуда (локация)</label>
                <input v-model="editData.from_location" class="form-control form-control-sm">
              </div>
              <div class="col-6">
                <label class="form-label small">Куда (локация)</label>
                <input v-model="editData.to_location" class="form-control form-control-sm">
              </div>
              <div class="col-12">
                <label class="form-label small">Комментарий</label>
                <input v-model="editData.comment" class="form-control form-control-sm">
              </div>
              <div class="col-12">
                <label class="form-label small">Дата</label>
                <input v-model="editData.moved_at" type="datetime-local" class="form-control form-control-sm">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary btn-sm" @click="editRecord = null">Отмена</button>
            <button class="btn btn-primary btn-sm" @click="saveEdit">Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
