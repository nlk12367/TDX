(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MAX_BASELINE_RANGE_KM = 480;
  const routeTab = $('routeTab');
  const nearbyTab = $('nearbyTab');
  const routePanel = $('routePanel');
  const nearbyPanel = $('nearbyPanel');
  const modeTabs = document.querySelector('.mode-tabs');
  const socInput = $('socInput');
  const socSlider = $('socSlider');
  let map;
  let polylines = [];
  let mapsPromise;
  let rangeAnimation = 0;

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
    modeTabs.dataset.mode = route ? 'route' : 'nearby';
    routeTab.setAttribute('aria-selected', String(route));
    nearbyTab.setAttribute('aria-selected', String(!route));
    routePanel.hidden = !route;
    nearbyPanel.hidden = route;
    (route ? routeTab : nearbyTab).focus();
  }
  routeTab.addEventListener('click', () => showMode('route'));
  nearbyTab.addEventListener('click', () => showMode('nearby'));
  [routeTab, nearbyTab].forEach((tab, index, tabs) => tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    showMode(next === routeTab ? 'route' : 'nearby');
  }));

  function estimate() {
    const soc = socInput.value === '' ? null : Number(socInput.value);
    const capacity = Number($('capacity').value);
    const efficiency = Number($('efficiency').value);
    const valid = Number.isFinite(soc) && soc >= 0 && soc <= 100 && capacity > 0 && efficiency > 0;
    const km = valid ? Math.min(capacity * (soc / 100) * efficiency, MAX_BASELINE_RANGE_KM) : null;
    const rangeNumber = $('rangeNumber');
    const rangeUnit = $('rangeUnit');
    window.cancelAnimationFrame(rangeAnimation);
    if (km === null) {
      rangeNumber.textContent = '輸入電量';
      rangeNumber.removeAttribute('data-value');
      rangeUnit.hidden = true;
      $('rangeAccessible').textContent = '請輸入目前電量以估算續航';
    } else {
      const target = Math.round(km);
      const start = Number(rangeNumber.dataset.value || 0);
      const startedAt = performance.now();
      rangeUnit.hidden = false;
      const tick = (now) => {
        const progress = Math.min(1, (now - startedAt) / 300);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = Math.round(start + (target - start) * eased);
        rangeNumber.textContent = value.toLocaleString('zh-TW');
        rangeNumber.dataset.value = String(value);
        if (progress < 1) rangeAnimation = window.requestAnimationFrame(tick);
        else $('rangeAccessible').textContent = `基準可行駛距離約 ${target.toLocaleString('zh-TW')} 公里`;
      };
      rangeAnimation = window.requestAnimationFrame(tick);
    }
    $('nearbyRange').textContent = km === null ? '輸入電量後顯示' : `約 ${Math.round(km).toLocaleString('zh-TW')} km`;
    const percent = Math.max(0, Math.min(100, Number.isFinite(soc) ? soc : 0));
    $('batteryFill').style.width = `${percent}%`;
    $('batteryFill').style.backgroundColor = percent > 50 ? '#46c879' : percent >= 20 ? '#FF9F1C' : '#E60012';
    socSlider.style.setProperty('--progress', `${percent}%`);
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
    const { soc, capacity, efficiency, rangeKm } = estimate();
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
      polylines = route.createPolylines({ polylineOptions: { strokeColor: '#E60012', strokeWeight: 5, strokeOpacity: 0.9 } });
      polylines.forEach((line) => line.setMap(currentMap));
      if (route.viewport) currentMap.fitBounds(route.viewport, 36);
      const distanceKm = route.distanceMeters / 1000;
      const arrivalSoc = Math.max(0, soc - (distanceKm / efficiency / capacity) * 100);
      const arrivalRange = Math.min(capacity * (arrivalSoc / 100) * efficiency, MAX_BASELINE_RANGE_KM, rangeKm);
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
    const setLocationStatus = (state, message, detail) => {
      $('locationStatus').className = `status-badge is-${state}`;
      $('locationMessage').textContent = message;
      $('locationDetail').textContent = detail;
    };
    if (!navigator.geolocation) {
      setLocationStatus('warning', '此瀏覽器不支援定位', '你仍可切換到路線模式查看基準續航。');
      return;
    }
    setLocationStatus('pending', '等待位置授權', '請在瀏覽器提示中允許存取目前位置。');
    navigator.geolocation.getCurrentPosition(
      async () => {
        setLocationStatus('pending', '正在驗證 TDX 憑證', '目前位置留在瀏覽器；只向本服務檢查伺服器端認證。');
        try {
          const response = await fetch('/api/tdx/status', { cache: 'no-store' });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.authenticated) throw new Error(result.message || '無法取得 TDX 驗證狀態，請確認服務已部署。');
          setLocationStatus('pending', 'TDX 憑證驗證成功', '伺服器已取得存取權杖；附近道路資料查詢尚未接入。');
          $('trafficLabel').textContent = 'TDX 認證成功・車流待查詢';
          $('trafficDetail').textContent = '憑證有效，但本頁目前尚未查詢附近偵測器或路段資料。';
        } catch (error) {
          setLocationStatus('warning', 'TDX 憑證尚未驗證', error instanceof Error ? error.message : '請確認 Zeabur Variables 與服務部署狀態。');
          $('trafficLabel').textContent = '附近車流尚未查詢';
          $('trafficDetail').textContent = '檢查 Zeabur 的 TDX_CLIENT_ID、TDX_CLIENT_SECRET 後重新部署，再重試。';
        }
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        setLocationStatus('warning', denied ? '尚未允許定位' : '目前無法取得位置', denied ? '可在瀏覽器網站權限中允許定位，再按一次重試。' : '請確認裝置定位已開啟，再按一次重試。');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });

  estimate();
})();
