interface ValidationResult {
  valid: boolean;
  message?: string;
  normalized: string;
}

export interface BulkValidationResult {
  validCodes: string[];
  invalidCodes: { code: string; message: string }[];
  duplicateCodes: string[];
}

// 兼容 A/H/美股常见代码格式的基础校验
export const validateStockCode = (value: string): ValidationResult => {
  const normalized = value.trim().toUpperCase();

  if (!normalized) {
    return { valid: false, message: '请输入股票代码', normalized };
  }

  const patterns = [
    /^\d{6}$/, // A 股 6 位数字
    /^(SH|SZ)\d{6}$/, // A 股带交易所前缀
    /^\d{5}$/, // 港股 5 位数字
    /^[A-Z]{1,6}(\.[A-Z]{1,2})?$/, // 美股常见 Ticker
  ];

  const valid = patterns.some((regex) => regex.test(normalized));

  return {
    valid,
    message: valid ? undefined : '股票代码格式不正确',
    normalized,
  };
};

// 批量验证股票代码列表，支持逗号、换行、空格分隔
export const validateStockCodes = (input: string): BulkValidationResult => {
  // 按逗号、换行、空格分割输入
  const codeArray = input.split(/[,\n\s]+/).map(c => c.trim()).filter(c => c.length > 0);
  const validCodes: string[] = [];
  const invalidCodes: { code: string; message: string }[] = [];
  const duplicateCodes: string[] = [];

  const seen = new Set<string>();

  for (const code of codeArray) {
    const trimmed = code.trim();
    if (!trimmed) continue;

    // 检查输入中的重复项
    if (seen.has(trimmed.toUpperCase())) {
      if (!duplicateCodes.includes(trimmed)) {
        duplicateCodes.push(trimmed);
      }
      continue;
    }
    seen.add(trimmed.toUpperCase());

    const validation = validateStockCode(trimmed);
    if (validation.valid) {
      validCodes.push(validation.normalized);
    } else {
      invalidCodes.push({
        code: trimmed,
        message: validation.message || '格式不正确'
      });
    }
  }

  return { validCodes, invalidCodes, duplicateCodes };
};
