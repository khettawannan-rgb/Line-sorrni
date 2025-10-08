// project-root/src/services/procurement/stockService.js
import dayjs from 'dayjs';
import mongoose from 'mongoose';
import StockItem from '../../models/StockItem.js';
import StockSnapshot from '../../models/StockSnapshot.js';
import Record from '../../models/Record.js';
import ProcurementAuditLog from '../../models/ProcurementAuditLog.js';

import { now, safeNumber, toPlainObject } from './helpers.js';

function buildQuery(filter = {}) {
  const query = {};
  if (filter.companyId) query.companyId = toObjectId(filter.companyId);
  if (filter.search) {
    query.itemName = { $regex: filter.search, $options: 'i' };
  }
  if (filter.tags?.length) {
    query.tags = { $in: filter.tags };
  }
  return query;
}

function computeForecast(item) {
  const avgDailyUsage = safeNumber(item.avgDailyUsage, 0);
  const currentQuantity = safeNumber(item.currentQuantity, 0);

  if (avgDailyUsage <= 0) return null;
  const daysLeft = currentQuantity / avgDailyUsage;
  if (!Number.isFinite(daysLeft)) return null;

  return now().add(daysLeft, 'day').toDate();
}

export async function listStockItems(filter = {}) {
  const query = buildQuery(filter);
  return StockItem.find(query).sort({ itemName: 1 }).lean();
}

export async function upsertStockItem(criteria, payload, actor = 'system') {
  if (!criteria || !criteria.companyId || !criteria.itemName) {
    throw new Error('companyId and itemName are required');
  }

  const doc = await StockItem.findOneAndUpdate(
    criteria,
    {
      ...payload,
      forecastDepletionDate: computeForecast({ ...criteria, ...payload }),
      lastRecordDate: payload.lastRecordDate || dayjs().format('YYYY-MM-DD'),
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await ProcurementAuditLog.create({
    entityType: 'STOCK',
    entityId: doc._id,
    action: 'upsert',
    actor,
    message: `อัปเดตสต็อก ${doc.itemName}`,
    metadata: { companyId: criteria.companyId?.toString?.() ?? criteria.companyId },
  });

  return toPlainObject(doc);
}

function toObjectId(id) {
  if (!id) return null;
  if (mongoose.isValidObjectId(id)) return new mongoose.Types.ObjectId(id);
  return id;
}

export async function refreshUsageFromRecords(companyId, options = {}) {
  if (!companyId) return [];
  const companyObjectId = toObjectId(companyId);

  const windowDays = Number(options.windowDays || 14);
  const sinceDate = dayjs().subtract(windowDays, 'day').format('YYYY-MM-DD');

  const records = await Record.aggregate([
    {
      $match: {
        companyId: companyObjectId,
        dateStr: { $gte: sinceDate },
        type: 'SELL',
      },
    },
    {
      $group: {
        _id: '$product',
        totalTons: { $sum: '$weightTons' },
        lastDate: { $max: '$dateStr' },
      },
    },
  ]);

  const updated = [];
  for (const row of records) {
    const itemName = row._id || 'ไม่ระบุสินค้า';
    const avgDailyUsage = Number((row.totalTons * 1000) / windowDays) || 0; // convert tons -> kg

    const doc = await StockItem.findOneAndUpdate(
      { companyId: companyObjectId, itemName },
      {
        $setOnInsert: { unit: 'กิโลกรัม', reorderPoint: 0, safetyStock: 0 },
        avgDailyUsage,
        lastRecordDate: row.lastDate,
        forecastDepletionDate: computeForecast({
          avgDailyUsage,
          currentQuantity: 0,
        }),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    updated.push(toPlainObject(doc));
  }

  return updated;
}

export async function getLowStockItems(companyId, config = {}) {
  if (!companyId) return [];
  const companyObjectId = toObjectId(companyId);
  const criteria = { companyId: companyObjectId };
  const items = await StockItem.find(criteria).lean();
  const safetyDays = Number(config.safetyDays || 3);

  return items
    .map((item) => {
      const forecastDate = computeForecast(item);
      const alertByThreshold =
        safeNumber(item.currentQuantity, 0) <= safeNumber(item.reorderPoint, 0);
      const alertByForecast =
        forecastDate && dayjs(forecastDate).isBefore(dayjs().add(safetyDays, 'day'));
      return { ...item, forecastDate, alert: alertByThreshold || alertByForecast };
    })
    .filter((item) => item.alert);
}

export async function generateSnapshot(companyId, config = {}) {
  if (!companyId) throw new Error('companyId is required');
  const companyObjectId = toObjectId(companyId);
  const items = await StockItem.find({ companyId: companyObjectId }).lean();

  const snapshotItems = items.map((item) => ({
    itemName: item.itemName,
    sku: item.sku,
    unit: item.unit,
    currentQuantity: item.currentQuantity,
    reorderPoint: item.reorderPoint,
    avgDailyUsage: item.avgDailyUsage,
    projectedRunoutDate: computeForecast(item),
    sourceRecordDate: item.lastRecordDate,
  }));

  const doc = await StockSnapshot.create({
    companyId: companyObjectId,
    items: snapshotItems,
    thresholdConfig: {
      defaultReorderPoint: config.defaultReorderPoint || 10,
      safetyStockDays: config.safetyStockDays || 3,
    },
  });

  await ProcurementAuditLog.create({
    entityType: 'STOCK',
    entityId: doc._id,
    action: 'snapshot',
    actor: 'system',
    message: `สร้างสแนปช็อตสต็อกสำหรับบริษัท ${companyId}`,
  });

  return toPlainObject(doc);
}
