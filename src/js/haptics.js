// Phone vibration, only when the setting allows it (More → Income & basics → Vibration).
import { S } from "./state.js";

export function buzz(pattern) {
  if (S.settings.haptics === false) return;
  try { navigator.vibrate?.(pattern); } catch (e) {}
}
