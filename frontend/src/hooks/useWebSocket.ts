import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io('/layers', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });
  }
  return socket;
}

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket>(getSocket());

  useEffect(() => {
    const s = socketRef.current;

    function onConnect() {
      setConnected(true);
    }

    function onDisconnect() {
      setConnected(false);
    }

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);

    // Set initial state if already connected
    if (s.connected) {
      setConnected(true);
    }

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  const subscribeLayer = useCallback((layerId: string) => {
    socketRef.current.emit('subscribe', layerId);
  }, []);

  const unsubscribeLayer = useCallback((layerId: string) => {
    socketRef.current.emit('unsubscribe', layerId);
  }, []);

  return {
    socket: socketRef.current,
    connected,
    subscribeLayer,
    unsubscribeLayer,
  };
}
