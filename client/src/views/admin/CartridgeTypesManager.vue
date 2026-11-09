<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api';

const types = ref([]);
const newName = ref('');
const editingId = ref(null);
const editingName = ref('');
const error = ref('');

async function load() {
  const { data } = await api.get('/references/cartridge-types');
  types.value = data;
}

async function add() {
  error.value = '';
  if (!newName.value) return;
  try {
    await api.post('/references/cartridge-types', { name: newName.value });
    newName.value = '';
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка';
  }
}

function startEdit(t) {
  editingId.value = t.id;
  editingName.value = t.name;
}

async function saveEdit() {
  try {
    await api.put(`/references/cartridge-types/${editingId.value}`, { name: editingName.value });
    editingId.value = null;
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка';
  }
}

async function deleteType(id) {
  try {
    await api.delete(`/references/cartridge-types/${id}`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка';
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="top-bar">
      <h1><i class="bi bi-tags"></i> Типы картриджей</h1>
    </div>
    <div v-if="error" class="alert alert-danger small">{{ error }}</div>
    <div class="card p-3">
      <div class="d-flex gap-2 mb-3">
        <input v-model="newName" class="form-control form-control-sm" placeholder="Новый тип картриджа">
        <button class="btn btn-primary btn-sm" @click="add"><i class="bi bi-plus-lg"></i></button>
      </div>
      <div v-for="t in types" :key="t.id" class="d-flex justify-content-between align-items-center p-2 border-bottom">
        <template v-if="editingId === t.id">
          <input v-model="editingName" class="form-control form-control-sm me-2">
          <button class="btn btn-success btn-sm me-1" @click="saveEdit"><i class="bi bi-check"></i></button>
          <button class="btn btn-secondary btn-sm" @click="editingId = null"><i class="bi bi-x"></i></button>
        </template>
        <template v-else>
          <span>{{ t.name }}</span>
          <div>
            <button class="btn btn-outline-secondary btn-sm me-1" @click="startEdit(t)"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-outline-danger btn-sm" @click="deleteType(t.id)"><i class="bi bi-trash"></i></button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
