import React, { useEffect } from 'react';
import { Check, X, Info, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
    message: string;
    type?: ToastType;
    duration?: number;
    onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'success', duration = 2000, onClose }) => {
    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [duration, onClose]);

    const getIcon = () => {
        switch (type) {
            case 'success': return <Check size={16} className="text-green-500" />;
            case 'error': return <X size={16} className="text-red-500" />;
            case 'warning': return <AlertTriangle size={16} className="text-yellow-500" />;
            case 'info': return <Info size={16} className="text-blue-500" />;
        }
    };

    return (
        <div
            className="fixed top-10 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-top-4 duration-200 cursor-pointer"
            onClick={onClose}
        >
            <div className="flex items-center gap-3 px-4 py-2 bg-[#252526] border border-[#3c3c3c] shadow-xl rounded-md min-w-[200px]">
                {getIcon()}
                <span className="text-sm font-medium text-[#cccccc]">{message}</span>
            </div>
        </div>
    );
};
