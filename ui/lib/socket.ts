"use client";

import { io, Socket } from "socket.io-client";
import { useEffect, useRef, useCallback, useState } from "react";

const SOCKET_URL = process.env.NEXT_PUBLIC_TALOS_SOCKET_URL || "";

let globalSocket: Socket | null = null;

function getSocket(): Socket {
  if (!globalSocket) {
    globalSocket = io(SOCKET_URL, {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }
  return globalSocket;
}

export interface TestRunUpdate {
  id: string;
  status: string;
  durationMs?: number;
  errorMessage?: string;
}

export interface DiscoveryUpdate {
  jobId: string;
  status: string;
  filesDiscovered?: number;
  filesIndexed?: number;
  chunksCreated?: number;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(() => getSocket().connected);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  const subscribe = useCallback(
    <T>(event: string, handler: (data: T) => void) => {
      socketRef.current?.on(event, handler);
      return () => {
        socketRef.current?.off(event, handler);
      };
    },
    []
  );

  const emit = useCallback((event: string, data: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { isConnected, subscribe, emit };
}

export function useTestRunUpdates(onUpdate: (update: TestRunUpdate) => void) {
  const { subscribe } = useSocket();

  useEffect(() => {
    return subscribe<TestRunUpdate>("talos:test-run-update", onUpdate);
  }, [subscribe, onUpdate]);
}

export function useDiscoveryUpdates(onUpdate: (update: DiscoveryUpdate) => void) {
  const { subscribe } = useSocket();

  useEffect(() => {
    return subscribe<DiscoveryUpdate>("talos:discovery-update", onUpdate);
  }, [subscribe, onUpdate]);
}
