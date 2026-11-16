<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api';

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const form = ref({
  notify_enabled: false,
  notify_on_assign: true,
  notify_on_unassign: true,
  notify_on_status: true,
  smtp_host: '',
  smtp_port: 465,
  smtp_secure: 'ssl',
  smtp_user: '',
  smtp_pass: '',
  notify_from: ''
});
const passSet = ref(false);

const testTo = ref('');
const testing = ref(false);
const testResult = ref(null); // { ok: bool, text }

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/settings/notifications');
    form.value.notify_enabled = data.enabled;
    form.value.notify_on_assign = data.onAssign;
    form.value.notify_on_unassign = data.onUnassign;
    form.value.notify_on_status = data.onStatus;
    form.value.smtp_host = data.smtp_host;
    form.value.smtp_port = data.smtp_port;
    form.value.smtp_secure = data.smtp_secure;
    form.value.smtp_user = data.smtp_user;
    form.value.notify_from = data.notify_from;
    passSet.value = data.smtp_pass_set;
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка загрузки настроек';
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    const payload = {
      notify_enabled: form.value.notify_enabled,
      notify_on_assign: form.value.notify_on_assign,
      notify_on_unassign: form.value.notify_on_unassign,
      notify_on_status: form.value.notify_on_status,
      smtp_host: form.value.smtp_host,
      smtp_port: form.value.smtp_port,
      smtp_secure: form.value.smtp_secure,
      smtp_user: form.value.smtp_user,
      notify_from: form.value.notify_from
    };
    if (form.value.smtp_pass) payload.smtp_pass = form.value.smtp_pass;
    const { data } = await api.put('/settings/notifications', payload);
    passSet.value = data.smtp_pass_set;
    form.value.smtp_pass = '';
    success.value = 'Настройки сохранены';
  } catch (e) {
    error.value = e.response?.data?.error || 'Ошибка сохранения';
  } finally {
    saving.value = false;
  }
}

async function sendTest() {
  testing.value = true;
  testResult.value = null;
  try {
    await api.post('/settings/notifications/test', { to: testTo.value });
    testResult.value = { ok: true, text: 'Тестовое письмо отправлено' };
  } catch (e) {
    testResult.value = { ok: false, text: e.response?.data?.error || 'Ошибка отправки' };
  } finally {
    testing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="top-bar">
      <h1><i class="bi bi-bell"></i> Настройка информирования</h1>
      <button class="btn btn-primary btn-sm" @click="save" :disabled="loading || saving">
        <i class="bi bi-check-lg"></i> {{ saving ? 'Сохранение…' : 'Сохранить' }}
      </button>
    </div>

    <div v-if="loading" class="text-center py-5"><div class="spinner-border text-primary"></div></div>

    <template v-else>
      <div v-if="error" class="alert alert-danger">{{ error }}</div>
      <div v-if="success" class="alert alert-success alert-dismissible py-2">
        {{ success }}
        <button type="button" class="btn-close btn-sm" @click="success = ''"></button>
      </div>

      <div class="row g-4">
        <!-- События информирования -->
        <div class="col-12">
          <div class="card">
            <div class="card-header"><strong><i class="bi bi-bell"></i> Email-информирование по оборудованию</strong></div>
            <div class="card-body">
              <div class="form-check form-switch mb-2">
                <input class="form-check-input" type="checkbox" id="notifyEnabled" v-model="form.notify_enabled">
                <label class="form-check-label fw-medium" for="notifyEnabled">Включить уведомления</label>
              </div>
              <div class="text-muted small mb-3">Письма приходят сотрудникам, у которых в карточке пользователя заполнен email.</div>
              <div class="row g-2">
                <div class="col-md-4">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="notifyAssign" v-model="form.notify_on_assign" :disabled="!form.notify_enabled">
                    <label class="form-check-label small" for="notifyAssign">Перемещение на сотрудника (с другого)</label>
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="notifyUnassign" v-model="form.notify_on_unassign" :disabled="!form.notify_enabled">
                    <label class="form-check-label small" for="notifyUnassign">Снятие с сотрудника (на другого)</label>
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="notifyStatus" v-model="form.notify_on_status" :disabled="!form.notify_enabled">
                    <label class="form-check-label small" for="notifyStatus">Смена статуса в рамках сотрудника</label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- SMTP -->
        <div class="col-12 col-lg-6">
          <div class="card h-100">
            <div class="card-header"><strong><i class="bi bi-envelope-gear"></i> SMTP-сервер ящика информирования</strong></div>
            <div class="card-body">
              <div class="row g-3">
                <div class="col-8">
                  <label class="form-label small">Сервер (host)</label>
                  <input v-model="form.smtp_host" class="form-control form-control-sm" placeholder="smtp.example.com">
                </div>
                <div class="col-4">
                  <label class="form-label small">Порт</label>
                  <input v-model.number="form.smtp_port" type="number" class="form-control form-control-sm" placeholder="465">
                </div>
                <div class="col-12">
                  <label class="form-label small">Шифрование</label>
                  <select v-model="form.smtp_secure" class="form-select form-select-sm">
                    <option value="ssl">SSL/TLS (обычно порт 465)</option>
                    <option value="tls">STARTTLS (обычно порт 587)</option>
                    <option value="none">Без шифрования (локальный ретранслятор)</option>
                  </select>
                </div>
                <div class="col-12">
                  <label class="form-label small">Логин ящика</label>
                  <input v-model="form.smtp_user" class="form-control form-control-sm" autocomplete="off" placeholder="notify@example.com">
                </div>
                <div class="col-12">
                  <label class="form-label small">Пароль ящика</label>
                  <input v-model="form.smtp_pass" type="password" class="form-control form-control-sm" autocomplete="new-password"
                         :placeholder="passSet ? '•••••••• (сохранён, оставьте пустым чтобы не менять)' : 'Пароль'">
                </div>
                <div class="col-12">
                  <label class="form-label small">От отправителя (если отличается от логина)</label>
                  <input v-model="form.notify_from" class="form-control form-control-sm" placeholder="notify@example.com">
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Проверка -->
        <div class="col-12 col-lg-6">
          <div class="card h-100">
            <div class="card-header"><strong><i class="bi bi-send-check"></i> Проверка SMTP</strong></div>
            <div class="card-body">
              <p class="small text-muted">Сначала сохраните настройки, затем отправьте тестовое письмо на любой адрес.</p>
              <label class="form-label small">Получатель тестового письма</label>
              <div class="input-group input-group-sm">
                <input v-model="testTo" type="email" class="form-control" placeholder="admin@example.com" @keyup.enter="sendTest">
                <button class="btn btn-outline-primary" @click="sendTest" :disabled="testing || !testTo">
                  <i class="bi bi-send"></i> {{ testing ? 'Отправка…' : 'Отправить' }}
                </button>
              </div>
              <div v-if="testResult" class="alert small py-2 mt-3 mb-0" :class="testResult.ok ? 'alert-success' : 'alert-danger'">
                {{ testResult.text }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
