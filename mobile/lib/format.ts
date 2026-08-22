const baghdadDateTime = new Intl.DateTimeFormat('ar-IQ', {
  timeZone: 'Asia/Baghdad',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDateTime(value: string | Date) {
  return baghdadDateTime.format(typeof value === 'string' ? new Date(value) : value);
}

export const bookingStatusLabel: Record<string, string> = {
  confirmed: 'مؤكد',
  checked_in: 'داخل الكراج',
  overstayed: 'متجاوز للوقت',
  completed: 'مكتمل',
  cancelled: 'ملغي',
  no_show: 'لم يحضر',
};

export const gateStateLabel: Record<string, string> = {
  closed: 'مغلقة',
  opening: 'تفتح',
  open_entry: 'مفتوحة للدخول',
  open_exit: 'مفتوحة للخروج',
  closing: 'تغلق',
  blocked: 'المسار محجوب',
  fault: 'عطل',
};

