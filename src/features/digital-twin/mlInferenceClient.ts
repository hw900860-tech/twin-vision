/**
 * Client Service for Python ML Inference Server (http://localhost:8000/predict).
 * Provides seamless fallback to Physics-backed Estimator if Python ML server is offline.
 */

export interface MlInferenceResponse {
  mlActive: boolean;
  statusText: string;
  modelOutputs?: any;
}

let isServerAvailable = false;
let lastCheckTime = 0;
const CHECK_INTERVAL_MS = 5000;

export async function queryMlInferenceServer(stateInputs: any): Promise<MlInferenceResponse> {
  const now = Date.now();

  // Rate-limit health checks if previously known to be offline
  if (!isServerAvailable && now - lastCheckTime < CHECK_INTERVAL_MS) {
    return {
      mlActive: false,
      statusText: '○ ML OFFLINE (Physics Fallback Active)',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);

    const res = await fetch('http://localhost:8000/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stateInputs),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      isServerAvailable = true;
      lastCheckTime = now;
      return {
        mlActive: true,
        statusText: '● TRAINED ML ACTIVE',
        modelOutputs: data.modelOutputs,
      };
    }
  } catch {
    isServerAvailable = false;
    lastCheckTime = now;
  }

  return {
    mlActive: false,
    statusText: '○ ML OFFLINE (Physics Fallback Active)',
  };
}
