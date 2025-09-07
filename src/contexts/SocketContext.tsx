//src/contexts/SocketContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { SOCKET_URL } from '../config';

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  joinEditRoom: (fileId: string) => void;
  leaveEditRoom: (fileId: string) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
  joinEditRoom: () => {},
  leaveEditRoom: () => {},
});

export const useSocket = () => useContext(SocketContext);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const { token, user } = useAuth();

  // Initialize socket connection when user is authenticated
  useEffect(() => {
    if (!token || !user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    const newSocket = io(SOCKET_URL, {
      auth: {
        token,
      },
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setConnected(false);
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token, user?.id]);

  const joinEditRoom = (fileId: string) => {
    if (socket && connected) {
      socket.emit('join-edit-room', { fileId });
    }
  };

  const leaveEditRoom = (fileId: string) => {
    if (socket && connected) {
      socket.emit('leave-edit-room', { fileId });
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        joinEditRoom,
        leaveEditRoom,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};