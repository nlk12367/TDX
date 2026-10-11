(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const routeTab = $('routeTab');
  const nearbyTab = $('nearbyTab');
  const routePanel = $('routePanel');
  const nearbyPanel = $('nearbyPanel');
  const socInput = $('socInput');
  const socSlider = $('socSlider');
  let map;
  let polylines = [];
  let mapsPromise;

  function initializeLiff() {
    const liffId = String(window.CHARGE_PLANNER_CONFIG?.liffId || '').trim();
    if (!liffId) return;
    const script = document.createElement('script');
    script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    script.async = true;
    script.onload = () => window.liff?.init({ liffId }).catch(() => {});
    document.head.append(script);
  }

  function showMode(mode) {
    const route = mode === 'route';
    routeTab.setAttribute('aria-selected', String(route));
    nearbyTab.setAttribute('aria-selected', String(!route));
    routePanel.hidden = !route;
    nearbyPanel.hidden = route;
    (route ? routeTab : nearbyTab).focus();
  }
  routeTab.addEventListener('click', () => showMode('route'));
  nearbyTab.addEventListener('click', () => showMode('nearby'));

  function estimate() {
    const soc = socInput.value === '' ? null : Number(socInput.value);
    const capacity = Number($('capacity').value);
    const efficiency = Number($('efficiency').value);
    const valid = Number.isFinite(soc) && soc >= 0 && soc <= 100 && capacity > 0 && efficiency > 0;
    const km = valid ? capacity * (soc / 100) * efficiency : null;
    const rangeText = km === null ? '輸入電量' : `${Math.round(km).toLocaleString('zh-TW')} km`;
    $('rangeValue').textContent = rangeText;
    $('nearbyRange').textContent = km === null ? '輸入電量後顯示' : `約 ${Math.round(km).toLocaleString('zh-TW')} km`;
    $('batteryFill').style.width = `${Math.max(0, Math.min(100, Number.isFinite(soc) ? soc : 0))}%`;
    return { soc, capacity, efficiency, rangeKm: km };
  }

  socInput.addEventListener('input', () => {
    const value = Number(socInput.value);
    if (socInput.value !== '' && value >= 0 && value <= 100) socSlider.value = String(value);
    estimate();
  });
  socSlider.addEventListener('input', () => { socInput.value = socSlider.value; estimate(); });
  $('capacity').addEventListener('input', estimate);
  $('efficiency').addEventListener('input', estimate);
  initializeLiff();

  function setStatus(message, isError = false) {
    const el = $('routeStatus');
    el.textContent = message;
    el.classList.toggle('is-error', isError);
  }

  function loadMaps() {
    if (mapsPromise) return mapsPromise;
    const key = String(window.CHARGE_PLANNER_CONFIG?.googleMapsApiKey || '').trim();
    if (!key) return Promise.reject(new Error('目前未設定 Google Maps API Key。'));
    mapsPromise = new Promise((resolve, reject) => {
      const callbackName = 'chargePlannerMapsReady';
      const timeout = window.setTimeout(() => reject(new Error('Google Maps 載入逾時，請稍後再試。')), 15000);
      window[callbackName] = () => { window.clearTimeout(timeout); resolve(); };
      const script = document.createElement('script');
      const params = new URLSearchParams({ key, loading: 'async', callback: callbackName, v: 'weekly', language: 'zh-TW', region: 'TW', auth_referrer_policy: 'origin' });
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      script.async = true;
      script.onerror = () => { window.clearTimeout(timeout); reject(new Error('Google Maps 無法載入，請確認網路與 API 設定。')); };
      document.head.append(script);
    });
    return mapsPromise;
  }

  async function ensureMap() {
    await loadMaps();
    const { Map } = await google.maps.importLibrary('maps');
    if (!map) {
      map = new Map($('map'), {
        center: { lat: 23.7, lng: 120.8 }, zoom: 7,
        mapId: window.CHARGE_PLANNER_CONFIG?.googleMapsMapId || 'DEMO_MAP_ID',
        colorScheme: google.maps.ColorScheme?.DARK,
        gestureHandling: 'cooperative', streetViewControl: false,
        mapTypeControl: false, fullscreenControl: false
      });
    }
    return map;
  }

  $('routeForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const origin = $('origin').value.trim();
    const destination = $('destination').value.trim();
    const { soc, capacity, efficiency } = estimate();
    if (soc === null || soc < 0 || soc > 100) {
      $('socInput').focus();
      return setStatus('請先輸入 0–100% 的目前電量，再規劃路線。', true);
    }
    if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isFinite(efficiency) || efficiency <= 0) {
      $('capacity').focus();
      return setStatus('請輸入大於 0 的電池容量與參考效率。', true);
    }
    if (!origin || !destination) return setStatus('請填寫起點與目的地。', true);
    const button = $('routeButton');
    button.disabled = true;
    button.textContent = '正在規劃路線…';
    $('routeResult').hidden = true;
    try {
      const currentMap = await ensureMap();
      const { Route } = await google.maps.importLibrary('routes');
      const result = await Route.computeRoutes({
        origin, destination, travelMode: 'DRIVING', routingPreference: 'TRAFFIC_AWARE',
        fields: ['path', 'distanceMeters', 'durationMillis', 'viewport']
      });
      const route = result.routes?.[0];
      if (!route) throw new Error('找不到可行駛路線，請確認地點名稱後再試。');
      polylines.forEach((line) => line.setMap(null));
      polylines = route.createPolylines({ polylineOptions: { strokeColor: '#ff2639', strokeWeight: 5, strokeOpacity: 0.9 } });
      polylines.forEach((line) => line.setMap(currentMap));
      if (route.viewport) currentMap.fitBounds(route.viewport, 36);
      const distanceKm = route.distanceMeters / 1000;
      const arrivalSoc = Math.max(0, soc - (distanceKm / efficiency / capacity) * 100);
      const arrivalRange = capacity * (arrivalSoc / 100) * efficiency;
      $('tripDistance').textContent = `${distanceKm.toFixed(1)} km`;
      $('tripDuration').textContent = `${Math.round(route.durationMillis / 60000)} 分鐘`;
      $('arrivalSoc').textContent = `${arrivalSoc.toFixed(0)}%`;
      $('arrivalRange').textContent = `約 ${Math.round(arrivalRange)} km`;
      $('routeResult').hidden = false;
      setStatus('路線已計算；抵達電量依參考效率估算，未含坡度、空調與駕駛差異。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '路線計算失敗，請稍後再試。', true);
    } finally {
      button.disabled = false;
      button.innerHTML = '規劃這段路線 <span aria-hidden="true">→</span>';
    }
  });

  $('locateButton').addEventListener('click', () => {
    const status = $('locationStatus');
    if (!navigator.geolocation) {
      status.textContent = '此瀏覽器不支援定位；你仍可在路線模式查看基準續航。';
      return;
    }
    status.textContent = '正在向瀏覽器要求目前位置…';
    navigator.geolocation.getCurrentPosition(
      () => {
        status.textContent = '定位已在此頁取得；目前不會傳送或保存。TDX 路況服務尚未設定，因此暫不顯示附近車流或路況修正。';
        $('trafficLabel').textContent = '已定位・路況待連線';
        $('trafficDetail').textContent = '接入 TDX 並完成續航模型校準後，才會顯示附近路段資料與路況續航估算。';
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED ? '你未授權定位；可在瀏覽器設定允許後重試。' : '目前無法取得位置，請確認裝置定位功能後重試。';
        status.textContent = message;
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });

  estimate();
})();
