#!/usr/bin/env node
import { buildWeatherAdvice } from '../project-root/src/services/advice/weather-advice.js';

const scenario = process.argv[2] || 'ok';
const module = await import(`../project-root/src/services/advice/mocks/${scenario}.json`, { assert: { type: 'json' } });
const data = module.default || module;
const advice = buildWeatherAdvice(data);
console.log('=== Weather Advice Scenario:', scenario, '===');
console.log(advice.formattedText);
