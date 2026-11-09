<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useReferencesStore } from '../stores/references';

const auth = useAuthStore();
const refs = useReferencesStore();
const router = useRouter();

const login = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function handleLogin() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(login.value, password.value);
    await refs.loadAll();
    router.push('/');
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка входа';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <i class="bi bi-box-seam" style="font-size:2.5rem;color:#3b82f6"></i>
        <h2>SAR</h2>
        <p>Система учёта оборудования</p>
      </div>
      <div v-if="error" class="alert alert-danger py-2 small">{{ error }}</div>
      <form @submit.prevent="handleLogin">
        <div class="mb-3">
          <label class="form-label small fw-medium">Логин</label>
          <div class="input-group">
            <span class="input-group-text bg-light"><i class="bi bi-person"></i></span>
            <input v-model="login" type="text" class="form-control" placeholder="Введите логин" required>
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label small fw-medium">Пароль</label>
          <div class="input-group">
            <span class="input-group-text bg-light"><i class="bi bi-lock"></i></span>
            <input v-model="password" type="password" class="form-control" placeholder="Введите пароль" required>
          </div>
        </div>
        <button type="submit" class="btn btn-primary w-100" :disabled="loading">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
          Войти
        </button>
      </form>
    </div>
  </div>
</template>
