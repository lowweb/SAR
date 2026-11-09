import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '../api';

export const useReferencesStore = defineStore('references', () => {
  const departments = ref([]);
  const equipmentTypes = ref([]);
  const equipmentStatuses = ref([]);
  const cartridgeStatuses = ref([]);
  const users = ref([]);
  const loaded = ref(false);

  async function loadAll() {
    if (loaded.value && departments.value.length > 0) return;
    const [d, t, se, sc, u] = await Promise.all([
      api.get('/references/departments'),
      api.get('/references/equipment-types'),
      api.get('/references/statuses', { params: { scope: 'equipment' } }),
      api.get('/references/statuses', { params: { scope: 'cartridge' } }),
      api.get('/references/users/all')
    ]);
    departments.value = d.data;
    equipmentTypes.value = t.data;
    equipmentStatuses.value = se.data;
    cartridgeStatuses.value = sc.data;
    users.value = u.data;
    loaded.value = true;
  }

  function getRefillStatusId() {
    return cartridgeStatuses.value.find(s => s.name === 'Отдали на заправку')?.id || null;
  }

  async function loadDepartments() {
    const { data } = await api.get('/references/departments');
    departments.value = data;
  }

  async function loadEquipmentTypes() {
    const { data } = await api.get('/references/equipment-types');
    equipmentTypes.value = data;
  }

  async function loadEquipmentStatuses() {
    const { data } = await api.get('/references/statuses', { params: { scope: 'equipment' } });
    equipmentStatuses.value = data;
  }

  async function loadCartridgeStatuses() {
    const { data } = await api.get('/references/statuses', { params: { scope: 'cartridge' } });
    cartridgeStatuses.value = data;
  }

  async function loadUsers() {
    const { data } = await api.get('/references/users/all');
    users.value = data;
  }

  function allStatuses() {
    return [...equipmentStatuses.value, ...cartridgeStatuses.value];
  }

  function getStatusName(id) {
    return allStatuses().find(s => s.id === id)?.name || '—';
  }

  function getStatusColor(id) {
    return allStatuses().find(s => s.id === id)?.color || '#6c757d';
  }

  function getTypeName(id) {
    return equipmentTypes.value.find(t => t.id === id)?.name || '—';
  }

  function getUserName(id) {
    if (!id) return 'Не назначен';
    return users.value.find(u => u.id === id)?.full_name || '—';
  }

  function getDeptName(id) {
    return departments.value.find(d => d.id === id)?.name || '—';
  }

  return { departments, equipmentTypes, equipmentStatuses, cartridgeStatuses, users, loadAll, loadDepartments, loadEquipmentTypes, loadEquipmentStatuses, loadCartridgeStatuses, loadUsers, getStatusName, getStatusColor, getRefillStatusId, getTypeName, getUserName, getDeptName };
});
