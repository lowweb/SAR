<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api';
import { useReferencesStore } from '../../stores/references';

const refs = useReferencesStore();

const users = ref([]);
const loading = ref(true);
const showAdd = ref(false);
const editId = ref(null);
const formData = ref({ login: '', password: '', full_name: '', role: 'user', department_id: '', email: '' });
const error = ref('');

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/references/users');
    users.value = data;
  } finally {
    loading.value = false;
  }
}

async function addUser() {
  error.value = '';
  try {
    await api.post('/references/users', {
      ...formData.value,
      department_id: formData.value.department_id ? Number(formData.value.department_id) : null
    });
    showAdd.value = false;
    resetForm();
    await load();
    await refs.loadUsers();
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка добавления';
  }
}

function startEdit(u) {
  editId.value = u.id;
  formData.value = {
    login: u.login,
    password: '',
    full_name: u.full_name,
    role: u.role,
    department_id: u.department_id || '',
    email: u.email || ''
  };
}

async function saveEdit() {
  error.value = '';
  try {
    await api.put(`/references/users/${editId.value}`, {
      ...formData.value,
      department_id: formData.value.department_id ? Number(formData.value.department_id) : null,
      password: formData.value.password || undefined
    });
    editId.value = null;
    resetForm();
    await load();
    await refs.loadUsers();
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка сохранения';
  }
}

async function deleteUser(id) {
  if (!confirm('Удалить пользователя?')) return;
  try {
    await api.delete(`/references/users/${id}`);
    await load();
    await refs.loadUsers();
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка удаления';
  }
}

function resetForm() {
  formData.value = { login: '', password: '', full_name: '', role: 'user', department_id: '', email: '' };
}

onMounted(load);
</script>

<template>
  <div>
    <div class="top-bar">
      <h1><i class="bi bi-people"></i> Пользователи</h1>
      <button class="btn btn-primary btn-sm" @click="showAdd = true; resetForm()">
        <i class="bi bi-plus-lg"></i> Добавить
      </button>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div class="card p-0 overflow-hidden">
      <table class="table table-hover mb-0">
        <thead>
          <tr>
            <th>Логин</th>
            <th>ФИО</th>
            <th>Роль</th>
            <th>Департамент</th>
            <th>Email</th>
            <th>Создан</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="7" class="text-center py-5"><div class="spinner-border text-primary"></div></td>
          </tr>
          <tr v-else-if="!users.length">
            <td colspan="7" class="text-center text-muted py-5">Пользователей нет</td>
          </tr>
          <tr v-for="u in users" :key="u.id">
            <td class="fw-medium">{{ u.login }}</td>
            <td>{{ u.full_name }}</td>
            <td>
              <span class="badge" :class="u.role === 'admin' ? 'bg-danger' : 'bg-info'">
                {{ u.role === 'admin' ? 'Админ' : 'Пользователь' }}
              </span>
            </td>
            <td>{{ u.department_name || '—' }}</td>
            <td class="small">{{ u.email || '—' }}</td>
            <td class="small">{{ new Date(u.created_at).toLocaleDateString('ru-RU') }}</td>
            <td>
              <button class="btn btn-sm btn-outline-secondary me-1" @click="startEdit(u)">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger" @click="deleteUser(u.id)">
                <i class="bi bi-trash"></i>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add/Edit Modal -->
    <div v-if="showAdd || editId" class="modal show d-block" style="background:rgba(0,0,0,0.5)" @click.self="showAdd = false; editId = null; resetForm()">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ editId ? 'Редактировать' : 'Добавить' }} пользователя</h5>
            <button type="button" class="btn-close" @click="showAdd = false; editId = null; resetForm()"></button>
          </div>
          <div class="modal-body">
            <div v-if="error" class="alert alert-danger small py-2">{{ error }}</div>
            <div class="row g-3">
              <div class="col-12">
                <label class="form-label small">Логин</label>
                <input v-model="formData.login" class="form-control form-control-sm" required>
              </div>
              <div class="col-12">
                <label class="form-label small">{{ editId ? 'Новый пароль (оставьте пустым, если не менять)' : 'Пароль' }}</label>
                <input v-model="formData.password" type="password" class="form-control form-control-sm" :required="!editId">
              </div>
              <div class="col-12">
                <label class="form-label small">ФИО</label>
                <input v-model="formData.full_name" class="form-control form-control-sm" required>
              </div>
              <div class="col-6">
                <label class="form-label small">Роль</label>
                <select v-model="formData.role" class="form-select form-select-sm">
                  <option value="user">Пользователь</option>
                  <option value="admin">Администратор</option>
                </select>
              </div>
              <div class="col-6">
                <label class="form-label small">Департамент</label>
                <select v-model="formData.department_id" class="form-select form-select-sm">
                  <option :value="''">—</option>
                  <option v-for="d in refs.departments" :key="d.id" :value="d.id">{{ d.name }}</option>
                </select>
              </div>
              <div class="col-12">
                <label class="form-label small">Email</label>
                <input v-model="formData.email" type="email" class="form-control form-control-sm">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary btn-sm" @click="showAdd = false; editId = null; resetForm()">Отмена</button>
            <button class="btn btn-primary btn-sm" @click="editId ? saveEdit() : addUser()">
              {{ editId ? 'Сохранить' : 'Добавить' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
