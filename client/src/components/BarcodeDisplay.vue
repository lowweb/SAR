<script setup>
import { ref, onMounted, watch } from 'vue';
import JsBarcode from 'jsbarcode';

const props = defineProps({
  value: { type: String, required: true },
  height: { type: Number, default: 50 },
  width: { type: Number, default: 1.5 },
  fontSize: { type: Number, default: 14 }
});

const svgRef = ref(null);

function render() {
  if (!svgRef.value || !props.value) return;
  try {
    JsBarcode(svgRef.value, props.value, {
      format: 'CODE128',
      height: props.height,
      width: props.width,
      fontSize: props.fontSize,
      margin: 5,
      displayValue: true
    });
  } catch {
    // fallback for invalid barcode data
  }
}

onMounted(render);
watch(() => props.value, render);
</script>

<template>
  <svg ref="svgRef" class="barcode-svg"></svg>
</template>
