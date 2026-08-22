import { BookingCard } from '@/components/booking-card';
import { LoadingBlock, Muted, Screen, Title } from '@/components/ui';
import { useBookings } from '@/hooks/use-bookings';

export default function BookingsScreen() {
  const { bookings, loading, refresh } = useBookings();
  if (loading) return <Screen><LoadingBlock /></Screen>;
  return (
    <Screen>
      <Title>حجوزاتي</Title>
      {bookings.length ? bookings.map((booking) => <BookingCard key={booking.id} booking={booking} onChanged={refresh} />) : <Muted>لا توجد حجوزات بعد.</Muted>}
    </Screen>
  );
}

