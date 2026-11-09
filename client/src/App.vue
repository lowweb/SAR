<script setup>
import { computed, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { useReferencesStore } from './stores/references';

const auth = useAuthStore();
const refs = useReferencesStore();
const router = useRouter();
const route = useRoute();

const showLayout = computed(() => auth.isAuthenticated);
const sidebarOpen = ref(false);

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
}

function closeSidebar() {
  sidebarOpen.value = false;
}

function onNavClick() {
  closeSidebar();
}

function logout() {
  closeSidebar();
  auth.logout();
  router.push('/login');
}

if (auth.isAuthenticated) {
  refs.loadAll();
}

router.afterEach(() => {
  closeSidebar();
});
</script>

<template>
  <div v-if="showLayout" class="d-flex wrap">
    <div v-if="sidebarOpen" class="sidebar-overlay" @click="closeSidebar"></div>
    <button class="burger-btn" @click="toggleSidebar">
      <i :class="sidebarOpen ? 'bi bi-x-lg' : 'bi bi-list'"></i>
    </button>
    <nav class="sidebar" :class="{ show: sidebarOpen }">
      <div class="brand">
        <i class="bi bi-box-seam"></i>
        <span>SAR</span>
      </div>
      <div class="sidebar-user px-3 py-3 border-bottom border-secondary border-opacity-25">
        <div class="small text-secondary">{{ auth.user?.full_name }}</div>
        <span class="badge" :class="auth.isAdmin ? 'bg-danger' : 'bg-info'">
          {{ auth.isAdmin ? 'Администратор' : 'Пользователь' }}
        </span>
      </div>
      <div class="mt-2">
        <div class="nav-section">Основное</div>
        <router-link to="/" class="nav-link" @click="onNavClick">
          <i class="bi bi-pc-display"></i> ИТ Оборудование
        </router-link>
        <router-link to="/cartridges" class="nav-link" @click="onNavClick">
          <i class="bi bi-printer"></i> Картриджи
        </router-link>
        <router-link to="/history" class="nav-link" @click="onNavClick">
          <i class="bi bi-clock-history"></i> История перемещений
        </router-link>
      </div>
      <div v-if="auth.isAdmin" class="mt-2">
        <div class="nav-section">Администрирование</div>
        <router-link to="/admin/users" class="nav-link" @click="onNavClick">
          <i class="bi bi-people"></i> Пользователи
        </router-link>
        <router-link to="/admin/departments" class="nav-link" @click="onNavClick">
          <i class="bi bi-building"></i> Департаменты
        </router-link>
        <router-link to="/admin/types" class="nav-link" @click="onNavClick">
          <i class="bi bi-tags"></i> Типы оборудования
        </router-link>
        <router-link to="/admin/statuses" class="nav-link" @click="onNavClick">
          <i class="bi bi-flag"></i> Статусы
        </router-link>
        <router-link to="/admin/notify" class="nav-link" @click="onNavClick">
          <i class="bi bi-bell"></i> Настройка информирования
        </router-link>
      </div>
      <div class="mt-auto p-3 position-absolute" style="bottom:0;left:0;right:0;">
        <button @click="logout" class="btn btn-outline-secondary w-100 btn-sm">
          <i class="bi bi-box-arrow-right"></i> Выйти
        </button>
      </div>
    </nav>
    <main class="main-content flex-grow-1">
      <router-view />
    </main>
  </div>
  <router-view v-else />
</template>
