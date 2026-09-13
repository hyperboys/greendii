const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STANDARD_STATUS,
  STATUS_LABELS_TH,
  normalizeStatus,
  mapDomainStatusToDb,
  getStatusLabelTh,
} = require('../src/lib/statusModel');
const { validateStateTransition } = require('../src/lib/stateTransition');

test('Status Model - Normalization and Mapping', () => {
  assert.equal(normalizeStatus('draft'), STANDARD_STATUS.DRAFT);
  assert.equal(normalizeStatus('pending'), STANDARD_STATUS.PENDING_APPROVAL);
  assert.equal(normalizeStatus('APPROVED'), STANDARD_STATUS.APPROVED);
  assert.equal(normalizeStatus('REJECTED'), STANDARD_STATUS.REJECTED);

  assert.equal(mapDomainStatusToDb('draft'), 'draft');
  assert.equal(mapDomainStatusToDb('pending'), 'pending');
  assert.equal(mapDomainStatusToDb('approved'), 'approved');
  assert.equal(mapDomainStatusToDb('rejected'), 'rejected');

  assert.equal(getStatusLabelTh('draft'), 'แบบร่าง');
  assert.equal(getStatusLabelTh('pending'), 'รออนุมัติ');
  assert.equal(getStatusLabelTh('approved'), 'อนุมัติแล้ว');
});

test('State Transition - Valid Transitions', () => {
  assert.equal(validateStateTransition('draft', 'pending', 'submit'), true);
  assert.equal(validateStateTransition('pending', 'approved', 'approve'), true);
  assert.equal(validateStateTransition('pending', 'rejected', 'reject', { reason: 'เอกสารไม่สมบูรณ์' }), true);
  assert.equal(validateStateTransition('pending', 'returned', 'return', { reason: 'ขอให้แก้ไขตัวเลข' }), true);
  assert.equal(validateStateTransition('draft', 'cancelled', 'cancel', { reason: 'ยกเลิกคำขอ' }), true);
});

test('State Transition - Invalid Transitions & Required Reasons', () => {
  assert.throws(
    () => validateStateTransition('cancelled', 'approved', 'approve'),
    /ไม่สามารถเปลี่ยนสถานะเอกสารที่ยกเลิกแล้วได้/,
  );

  assert.throws(
    () => validateStateTransition('completed', 'draft', 'edit'),
    /ไม่สามารถเปลี่ยนสถานะเอกสารที่เสร็จสิ้นแล้วได้/,
  );

  assert.throws(
    () => validateStateTransition('pending', 'rejected', 'reject', { reason: '' }),
    /ต้องระบุเหตุผลสำหรับการทำรายการ "reject"/,
  );
});
