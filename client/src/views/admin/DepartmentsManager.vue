<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api';
import { useReferencesStore } from '../../stores/references';

const refs = useReferencesStore();

const items = ref([]);
const loading = ref(true);
const showAdd = ref(false);
const editId = ref(null);
const name = ref('');
const error = ref('');

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/references/departments');
    items.value = data;
  } finally {
    loading.value = false;
  }
}

async function add() {
  error.value = '';
  if (!name.value.trim()) return;
  try {
    await api.post('/references/departments', { name: name.value.trim() });
    showAdd.value = false;
    name.value = '';
    await load();
    await refs.loadDepartments();
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка';
  }
}

function startEdit(item) {
  editId.value = item.id;
  name.value = item.name;
}

async function saveEdit() {
  error.value = '';
  if (!name.value.trim()) return;
  try {
    await api.put(`/references/departments/${editId.value}`, { name: name.value.trim() });
    editId.value = null;
    name.value = '';
    await load();
    await refs.loadDepartments();
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка';
  }
}

async function remove(id) {
  if (!confirm('Удалить?')) return;
  try {
    await api.delete(`/references/departments/${id}`);
    await load();
    await refs.loadDepartments();
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка удаления';
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="top-bar">
      <h1><i class="bi bi-building"></i> Департаменты</h1>
      <button class="btn btn-primary btn-sm" @click="showAdd = true; name = ''">
        <i class="bi bi-plus-lg"></i> Добавить
      </button>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div class="card p-0 overflow-hidden">
      <table class="table table-hover mb-0">
        <thead>
          <tr>
            <th>ID</th>
            <th>Название</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="3" class="text-center py-5"><div class="spinner-border text-primary"></div></td>
          </tr>
          <tr v-else-if="!items.length">
            <td colspan="3" class="text-center text-muted py-5">Нет данных</td>
          </tr>
          <tr v-for="item in items" :key="item.id">
            <td>{{ item.id }}</td>
            <td class="fw-medium">{{ item.name }}</td>
            <td>
              <button class="btn btn-sm btn-outline-secondary me-1" @click="startEdit(item)">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger" @click="remove(item.id)">
                <i class="bi bi-trash"></i>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add/Edit Modal -->
    <div v-if="showAdd || editId" class="modal show d-block" style="background:rgba(0,0,0,0.5)" @click.self="showAdd = false; editId = null; name = ''">
      <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content">
          <div class="modal-header py-2">
            <h6 class="modal-title">{{ editId ? 'Редактировать' : 'Добавить' }} департамент</h6>
            <button type="button" class="btn-close" @click="showAdd = false; editId = null; name = ''"></button>
          </div>
          <div class="modal-body">
            <input v-model="name" class="form-control form-control-sm" placeholder="Название" @keyup.enter="editId ? saveEdit() : add()">
          </div>
          <div class="modal-footer py-2">
            <button class="btn btn-secondary btn-sm" @click="showAdd = false; editId = null; name = ''">Отмена</button>
            <button class="btn btn-primary btn-sm" @click="editId ? saveEdit() : add()">{{ editId ? 'Сохранить' : 'Добавить' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
