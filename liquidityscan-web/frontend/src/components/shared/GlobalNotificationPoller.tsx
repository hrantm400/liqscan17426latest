import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSignals } from '../../services/signalsApi';
import { useSignalNotifications } from '../../hooks/useSignalNotifications';
import { useTierGating } from '../../hooks/useTierGating';

export const GlobalNotificationPoller: React.FC = () => {
    // Fetch top 30 most recent signals across all strategies every 30 seconds
    const { data: signals } = useQuery({
        queryKey: ['signals', 'global_poller', 30],
        queryFn: () => fetchSignals(undefined, 30),
        refetchInterval: 30000,
        placeholderData: (prev) => prev,
    });

    const { isSymbolAllowed } = useTierGating();

    const filteredSignals = (signals || []).filter((signal) => isSymbolAllowed(signal.symbol));

    // Run the notification logic off this global signal feed
    useSignalNotifications(filteredSignals);

    // Non-visual component
    return null;
};
