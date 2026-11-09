<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../api';
import { useReferencesStore } from '../../stores/references';

const refs = useReferencesStore();

const catalogs = ref([
  { scope: 'equipment', title: 'Статусы оборудования', icon: 'bi bi-pc-display', items: [], loading: true },
  { scope: 'cartridge', title: 'Статусы картриджей', icon: 'bi bi-printer', items: [], loading: true }
]);

const showModal = ref(false);
const editId = ref(null);
const activeScope = ref('equipment');
const name = ref('');
const color = ref('#6c757d');
const error = ref('');

const activeCatalog = computed(() => catalogs.value.find(c => c.scope === activeScope.value));
const modalTitle = computed(() => `${editId.value ? 'Редактировать' : 'Добавить'} статус — ${activeCatalog.value?.title || ''}`);

async function loadCatalog(catalog) {
  catalog.loading = true;
  try {
    const { data } = await api.get('/references/statuses', { params: { scope: catalog.scope } });
    catalog.items = data;
  } finally {
    catalog.loading = false;
  }
}

function loadAll() {
  return Promise.all(catalogs.value.map(loadCatalog));
}

function closeModal() {
  showModal.value = false;
  editId.value = null;
  name.value = '';
  color.value = '#6c757d';
  error.value = '';
}

function openAdd(scope) {
  activeScope.value = scope;
  editId.value = null;
  name.value = '';
  color.value = '#6c757d';
  error.value = '';
  showModal.value = true;
}

function startEdit(scope, item) {
  activeScope.value = scope;
  editId.value = item.id;
  name.value = item.name;
  color.value = item.color || '#6c757d';
  error.value = '';
  showModal.value = true;
}

async function refreshStore(scope) {
  if (scope === 'cartridge') await refs.loadCartridgeStatuses();
  else await refs.loadEquipmentStatuses();
}

async function save() {
  error.value = '';
  if (!name.value.trim()) return;
  try {
    const scope = activeScope.value;
    if (editId.value) {
      await api.put(`/references/statuses/${editId.value}`, { name: name.value.trim(), color: color.value, scope });
    } else {
      await api.post('/references/statuses', { name: name.value.trim(), color: color.value, scope });
    }
    closeModal();
    await loadCatalog(catalogs.value.find(c => c.scope === scope));
    await refreshStore(scope);
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка';
  }
}

async function remove(scope, id) {
  if (!confirm('Удалить?')) return;
  error.value = '';
  try {
    await api.delete(`/references/statuses/${id}`);
    await loadCatalog(catalogs.value.find(c => c.scope === scope));
    await refreshStore(scope);
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка удаления';
  }
}

onMounted(loadAll);
</script>

<template>
  <div>
    <div class="top-bar">
      <h1><i class="bi bi-flag"></i> Статусы</h1>
    </div>

    <div v-if="error && !showModal" class="alert alert-danger">{{ error }}</div>

    <div class="row g-4">
      <div v-for="catalog in catalogs" :key="catalog.scope" class="col-12">
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <strong><i :class="catalog.icon"></i> {{ catalog.title }}</strong>
            <button class="btn btn-primary btn-sm" @click="openAdd(catalog.scope)">
              <i class="bi bi-plus-lg"></i> Добавить
            </button>
          </div>
          <div class="table-responsive">
            <table class="table table-hover mb-0">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Название</th>
                  <th>Цвет</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="catalog.loading">
                  <td colspan="4" class="text-center py-4"><div class="spinner-border text-primary"></div></td>
                </tr>
                <tr v-else-if="!catalog.items.length">
                  <td colspan="4" class="text-center text-muted py-4">Нет данных</td>
                </tr>
                <tr v-for="item in catalog.items" :key="item.id">
                  <td>{{ item.id }}</td>
                  <td class="fw-medium">
                    <span class="status-badge" :style="{ background: item.color }">{{ item.name }}</span>
                  </td>
                  <td>
                    <span class="d-inline-block rounded" :style="{ width: '24px', height: '24px', background: item.color }"></span>
                  </td>
                  <td>
                    <button class="btn btn-sm btn-outline-secondary me-1" @click="startEdit(catalog.scope, item)">
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" @click="remove(catalog.scope, item.id)">
                      <i class="bi bi-trash"></i>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <div v-if="showModal" class="modal show d-block" style="background:rgba(0,0,0,0.5)" @click.self="closeModal">
      <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content">
          <div class="modal-header py-2">
            <h6 class="modal-title">{{ modalTitle }}</h6>
            <button type="button" class="btn-close" @click="closeModal"></button>
          </div>
          <div class="modal-body">
            <div v-if="error" class="alert alert-danger small py-2">{{ error }}</div>
            <div class="mb-3">
              <label class="form-label small">Название</label>
              <input v-model="name" class="form-control form-control-sm" placeholder="Название" @keyup.enter="save">
            </div>
            <div class="mb-0">
              <label class="form-label small">Цвет</label>
              <div class="d-flex gap-2 align-items-center">
                <input v-model="color" type="color" class="form-control form-control-sm" style="width:50px;padding:3px;height:32px">
                <input v-model="color" class="form-control form-control-sm" placeholder="#000000">
              </div>
            </div>
          </div>
          <div class="modal-footer py-2">
            <button class="btn btn-secondary btn-sm" @click="closeModal">Отмена</button>
            <button class="btn btn-primary btn-sm" @click="save">{{ editId ? 'Сохранить' : 'Добавить' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>