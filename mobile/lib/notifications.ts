import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function scheduleBookingReminders(bookingId: string, startAt: string) {
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return;

  const start = new Date(startAt).getTime();
  for (const minutes of [30, 15]) {
    const triggerAt = new Date(start - minutes * 60_000);
    if (triggerAt.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'تذكير بحجز الكراج',
        body: `باقي ${minutes} دقيقة على موعد حجزك`,
        data: { bookingId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerAt },
    });
  }
}

