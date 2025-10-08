// project-root/src/services/weather.js
import axios from 'axios';

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';
const DEFAULT_TIMEZONE = encodeURIComponent(process.env.DEFAULT_TZ || 'Asia/Bangkok');

function round(num, digits = 1) {
  if (num === null || num === undefined) return null;
  const factor = 10 ** digits;
  return Math.round(Number(num) * factor) / factor;
}

export async function fetchWeatherSummary(latitude, longitude, address = '') {
  if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
    throw new Error('latitude/longitude is required');
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current_weather: 'true',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    timezone: decodeURIComponent(DEFAULT_TIMEZONE),
  });

  try {
    const { data } = await axios.get(`${OPEN_METEO_BASE}?${params.toString()}`);
    if (!data) throw new Error('No weather response');

    const info = {
      latitude: Number(latitude),
      longitude: Number(longitude),
      address,
      current: {},
      daily: {},
      source: 'Open-Meteo',
    };

    const current = data.current_weather || {};
    if (current && current.temperature !== undefined) {
      const temp = round(current.temperature, 1);
      const wind = round(current.windspeed, 1);
      const { label, emoji } = describeWeatherCode(current.weathercode);
      info.current = {
        temperature: temp,
        wind,
        label,
        emoji,
        weatherCode: current.weathercode,
        time: current.time || null,
      };
    }

    const daily = (data.daily && data.daily.time && data.daily.time.length) ? data.daily : null;
    if (daily) {
      const max = round(daily.temperature_2m_max?.[0], 1);
      const min = round(daily.temperature_2m_min?.[0], 1);
      const rain = round(daily.precipitation_sum?.[0], 1);
      info.daily = {
        maxTemperature: max,
        minTemperature: min,
        precipitation: rain,
      };
    }

    return info;
  } catch (err) {
    console.error('[WEATHER] fetchWeatherSummary error:', err.message);
    throw new Error('เรียกข้อมูลพยากรณ์อากาศไม่สำเร็จ');
  }
}

function describeWeatherCode(code) {
  const mapping = {
    0: { label: 'ท้องฟ้าแจ่มใส', emoji: '☀️' },
    1: { label: 'มีเมฆน้อย', emoji: '🌤️' },
    2: { label: 'มีเมฆบางส่วน', emoji: '⛅' },
    3: { label: 'เมฆมาก', emoji: '☁️' },
    45: { label: 'หมอกปกคลุม', emoji: '🌫️' },
    48: { label: 'หมอกน้ำค้างแข็ง', emoji: '🌫️' },
    51: { label: 'ฝนปรอยเล็กน้อย', emoji: '🌦️' },
    53: { label: 'ฝนปรอยปานกลาง', emoji: '🌦️' },
    55: { label: 'ฝนปรอยค่อนข้างหนัก', emoji: '🌧️' },
    61: { label: 'ฝนเล็กน้อย', emoji: '🌧️' },
    63: { label: 'ฝนปานกลาง', emoji: '🌧️' },
    65: { label: 'ฝนหนัก', emoji: '⛈️' },
    66: { label: 'ฝนเยือกแข็งเล็กน้อย', emoji: '🌧️' },
    67: { label: 'ฝนเยือกแข็งรุนแรง', emoji: '🌧️' },
    71: { label: 'หิมะเล็กน้อย', emoji: '🌨️' },
    73: { label: 'หิมะปานกลาง', emoji: '🌨️' },
    75: { label: 'หิมะหนัก', emoji: '❄️' },
    77: { label: 'หิมะเกล็ดละเอียด', emoji: '🌨️' },
    80: { label: 'ฝนตกโปรยเป็นช่วง ๆ', emoji: '🌦️' },
    81: { label: 'ฝนตกชุกเป็นช่วง ๆ', emoji: '🌦️' },
    82: { label: 'ฝนตกหนักเป็นช่วง ๆ', emoji: '🌧️' },
    85: { label: 'หิมะโปรยปราย', emoji: '🌨️' },
    86: { label: 'หิมะตกหนักเป็นช่วง ๆ', emoji: '❄️' },
    95: { label: 'พายุฝนฟ้าคะนอง', emoji: '⛈️' },
    96: { label: 'ฝนฟ้าคะนองมีลูกเห็บ', emoji: '⛈️' },
    99: { label: 'พายุฝนฟ้าคะนองรุนแรง', emoji: '🌪️' },
  };
  return mapping[Number(code)] || { label: '', emoji: '' };
}

export function buildWeatherFlex(summary) {
  if (!summary || summary.current?.temperature === undefined) return null;
  const {
    latitude,
    longitude,
    address,
    current = {},
    daily = {},
  } = summary;
  const locationText = address || `${latitude?.toFixed?.(3) ?? latitude}, ${longitude?.toFixed?.(3) ?? longitude}`;
  const tempText = current.temperature !== undefined ? `${current.temperature.toFixed(1)}°C` : '-';
  const maxText = daily.maxTemperature !== null && daily.maxTemperature !== undefined
    ? `${daily.maxTemperature.toFixed(1)}°`
    : '-';
  const minText = daily.minTemperature !== null && daily.minTemperature !== undefined
    ? `${daily.minTemperature.toFixed(1)}°`
    : '-';
  const rainText = daily.precipitation !== null && daily.precipitation !== undefined
    ? `${daily.precipitation.toFixed(1)} มม.`
    : '-';

  return {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '24px',
      backgroundColor: '#2834d9',
      cornerRadius: '24px',
      contents: [
        {
          type: 'text',
          text: 'พยากรณ์อากาศ',
          color: '#c7d2fe',
          size: 'xs',
          weight: 'bold',
          letterSpacing: '0.2em',
        },
    {
      type: 'text',
      text: tempText,
      size: 'xxl',
      weight: 'bold',
      color: '#ffffff',
      margin: 'lg',
    },
        {
          type: 'text',
          text: `${current.emoji || ''} ${current.label || ''}`.trim(),
          color: '#e0e7ff',
          size: 'md',
          margin: 'sm',
        },
        {
          type: 'text',
          text: locationText || '-',
          wrap: true,
          color: '#cbd5f5',
          size: 'sm',
          margin: 'md',
        },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'xs',
          contents: [
            weatherRow('สูงสุด', maxText),
            weatherRow('ต่ำสุด', minText),
            weatherRow('คาดการณ์ฝน', rainText),
            current.wind !== null && current.wind !== undefined
              ? weatherRow('ลม', `${current.wind.toFixed(1)} กม./ชม.`)
              : null,
          ].filter(Boolean),
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      paddingAll: '16px',
      backgroundColor: '#1f2ab8',
      contents: [
        {
          type: 'text',
          text: 'Open-Meteo',
          color: '#cbd5f5',
          size: 'xs',
        },
        {
          type: 'text',
          text: new Date().toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit' }),
          color: '#cbd5f5',
          size: 'xs',
          align: 'end',
        },
      ],
    },
  };
}

function weatherRow(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#cbd5f5' },
      { type: 'text', text: value, size: 'sm', color: '#ffffff', align: 'end' },
    ],
  };
}

export function formatWeatherText(summary, note = '') {
  if (!summary || !summary.current) return 'พยากรณ์อากาศไม่พร้อมใช้งาน';
  const lines = [];
  const title = summary.address
    ? `พยากรณ์อากาศบริเวณ ${summary.address}`
    : 'พยากรณ์อากาศในพื้นที่ของคุณ';
  lines.push(title);

  const temp = summary.current.temperature !== undefined
    ? `${summary.current.temperature.toFixed(1)}°C`
    : null;
  const label = summary.current.label || '';
  const rawEmoji = summary.current.emoji || '';
  const emoji = rawEmoji || 'ℹ️';

  if (rawEmoji || label || temp) {
    const statusParts = ['ตอนนี้', emoji];
    if (label) statusParts.push(label);
    lines.push(statusParts.join(' '));
  }

  if (temp) {
    lines.push(`อุณหภูมิประมาณ ${temp}`);
  }

  if (summary.current.wind !== null && summary.current.wind !== undefined) {
    lines.push(`ลม ${summary.current.wind.toFixed(1)} กม./ชม.`);
  }

  const max = summary.daily?.maxTemperature;
  const min = summary.daily?.minTemperature;
  const rain = summary.daily?.precipitation;
  const rangeParts = [];
  if (max !== null && max !== undefined) rangeParts.push(`สูงสุด ${max.toFixed(1)}°C`);
  if (min !== null && min !== undefined) rangeParts.push(`ต่ำสุด ${min.toFixed(1)}°C`);
  if (rain !== null && rain !== undefined) rangeParts.push(`ปริมาณฝนคาดการณ์ ${rain.toFixed(1)} มม.`);
  if (rangeParts.length) lines.push(rangeParts.join(' · '));

  lines.push('ข้อมูลจาก Open-Meteo (อัปเดตทุกชั่วโมง)');
  if (note) lines.push(note);

  return lines.join('\n');
}
