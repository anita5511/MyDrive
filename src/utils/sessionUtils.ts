// src/utils/sessionUtils.ts
import { v4 as uuidv4 } from 'uuid';

// Fetch the user's public IP
export async function fetchIP(): Promise<string> {
  const res = await fetch('https://api.ipify.org?format=json');
  const { ip } = await res.json();
  return ip;
}

// Generate or retrieve a stable device ID
export function getDeviceId(): string {
  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    deviceId = uuidv4();
    localStorage.setItem('deviceId', deviceId);
  }
  return deviceId;
}

// Validate session against your backend
export async function checkSession(ip: string, deviceId: string) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${import.meta.env.VITE_API_URL}/api/session/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ ip, deviceId }),
  });
  if (!response.ok) throw new Error('Session validation failed');
  return response.json(); // { valid: boolean }
}
