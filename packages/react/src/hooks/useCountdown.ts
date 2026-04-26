import { useEffect, useState } from 'react';

export type Countdown = {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
};

export default function useCountdown(date: Date | number | string): Countdown {
  const [countdown, setCountdown] = useState<Countdown>({
    days: '00',
    hours: '00',
    minutes: '00',
    seconds: '00'
  });

  useEffect(() => {
    const update = () => {
      const start = new Date(date).getTime();
      const distance = start - Date.now();

      const days = String(Math.max(0, Math.floor(distance / (1000 * 60 * 60 * 24)))).padStart(2, '0');
      const hours = String(Math.max(0, Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)))).padStart(2, '0');
      const minutes = String(Math.max(0, Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)))).padStart(2, '0');
      const seconds = String(Math.max(0, Math.floor((distance % (1000 * 60)) / 1000))).padStart(2, '0');

      setCountdown({ days, hours, minutes, seconds });
    };

    update();
    const id = setInterval(update, 1000);

    return () => clearInterval(id);
  }, [date]);

  return countdown;
}
