<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { Html5Qrcode } from 'html5-qrcode';

const emit = defineEmits(['scan', 'close']);

const scannerId = 'barcode-scanner-' + Math.random().toString(36).slice(2, 9);
const scanner = ref(null);
const error = ref('');
const scanning = ref(true);
const detectedCode = ref('');

async function startCamera() {
  error.value = '';
  scanning.value = true;
  try {
    const html5QrCode = new Html5Qrcode(scannerId);
    scanner.value = html5QrCode;

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 150 },
      formatsToSupport: [
        0, 1, 2, 3, 4, 6, 7, 8, 10, 11
      ]
    };

    await html5QrCode.start(
      { facingMode: 'environment' },
      config,
      (decodedText) => {
        detectedCode.value = decodedText;
        emit('scan', decodedText);
        stopScanner();
      },
      () => {}
    );
  } catch (e) {
    console.error('Camera error:', e);
    scanning.value = false;
    const msg = e?.message || String(e);
    if (msg.includes('Permission') || msg.includes('denied')) {
      error.value = 'Доступ к камере запрещён. Разрешите доступ в настройках браузера.';
    } else if (msg.includes('NotFound') || msg.includes('not found')) {
      error.value = 'Камера не найдена на этом устройстве.';
    } else if (msg.includes('secure context') || msg.includes('HTTPS') || msg.includes('NotAllowedError')) {
      error.value = 'Камера доступна только по HTTPS. Откройте приложение по адресу https://...';
    } else {
      error.value = 'Не удалось открыть камеру. Проверьте, что вы открываете приложение по HTTPS.';
    }
  }
}

async function stopScanner() {
  scanning.value = false;
  try {
    if (scanner.value?.isScanning) {
      await scanner.value.stop();
    }
    scanner.value?.clear();
    scanner.value = null;
  } catch {}
}

function retry() {
  stopScanner().then(() => startCamera());
}

function close() {
  stopScanner();
  emit('close');
}

onMounted(startCamera);
onBeforeUnmount(stopScanner);
</script>

<template>
  <div class="barcode-scanner-overlay d-flex align-items-center justify-content-center">
    <div class="barcode-scanner-card">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h6 class="mb-0">
          <i class="bi bi-camera"></i> Сканирование штрих-кода
        </h6>
        <button class="btn btn-sm btn-outline-light" @click="close">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>

      <div v-if="error" class="alert alert-warning small py-2 mb-3">
        <i class="bi bi-exclamation-triangle"></i> {{ error }}
        <div class="mt-2">
          <button class="btn btn-sm btn-warning me-2" @click="retry">
            <i class="bi bi-arrow-repeat"></i> Повторить
          </button>
          <button class="btn btn-sm btn-outline-warning" @click="close">Закрыть</button>
        </div>
      </div>

      <div v-if="scanning && !error" :id="scannerId" class="scanner-viewfinder"></div>

      <div v-if="detectedCode && !scanning" class="text-center py-4">
        <i class="bi bi-check-circle-fill text-success fs-1"></i>
        <div class="mt-2 text-success fw-medium">Штрих-код: {{ detectedCode }}</div>
      </div>

      <div v-if="scanning && !error" class="text-center mt-2 small text-muted">
        Наведите камеру на штрих-код
      </div>
    </div>
  </div>
</template>

<style scoped>
.barcode-scanner-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 2000;
  padding: 16px;
}

.barcode-scanner-card {
  background: #1e293b;
  border-radius: 16px;
  padding: 20px;
  width: 100%;
  max-width: 420px;
  color: #e2e8f0;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}

.scanner-viewfinder {
  width: 100%;
  max-width: 380px;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 12px;
  background: #0f172a;
  margin: 0 auto;
}

.scanner-viewfinder :deep(video) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover;
  border-radius: 12px;
}

.scanner-viewfinder :deep(img) {
  display: none;
}
</style>