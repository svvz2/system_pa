export type SimulatorCommand =
  | { type: 'slot'; slotNumber: number; state: 'occupied' | 'free' }
  | { type: 'fault'; slotNumber: number }
  | { type: 'entry' | 'exit' | 'offline' | 'online' | 'reboot' | 'status' | 'help' | 'quit' };

export function parseCommand(input: string): SimulatorCommand | null {
  const parts = input.trim().toLowerCase().split(/\s+/);
  if (!parts[0]) return null;
  if (parts[0] === 'slot' && /^[1-6]$/.test(parts[1] ?? '') && ['occupied', 'free'].includes(parts[2])) {
    return { type: 'slot', slotNumber: Number(parts[1]), state: parts[2] as 'occupied' | 'free' };
  }
  if (parts[0] === 'fault' && /^[1-6]$/.test(parts[1] ?? '')) return { type: 'fault', slotNumber: Number(parts[1]) };
  if (['entry', 'exit', 'offline', 'online', 'reboot', 'status', 'help', 'quit'].includes(parts[0])) {
    return { type: parts[0] as Exclude<SimulatorCommand['type'], 'slot' | 'fault'> } as SimulatorCommand;
  }
  return null;
}

export const helpText = `
الأوامر المتاحة:
  slot <1-6> occupied   وضع سيارة في موقف
  slot <1-6> free       تفريغ موقف
  fault <1-6>           محاكاة عطل حساس
  entry                 تأكيد عبور الدخول بعد أمر فتح
  exit                  محاكاة عبور خروج تلقائي
  offline | online      فصل/إعادة الشبكة
  reboot                إعادة تشغيل ESP32 الافتراضي
  status                عرض الحالة الحالية
  help | quit
`;

