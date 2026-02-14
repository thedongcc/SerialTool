import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Toast, ToastType } from '../components/common/Toast';

interface ToastContextType {
    showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toast, setToast] = useState<{ message: string; type: ToastType; duration: number } | null>(null);

    const showToast = useCallback((message: string, type: ToastType = 'success', duration: number = 2000) => {
        setToast({ message, type, duration });
    }, []);

    const hideToast = useCallback(() => {
        setToast(null);
    }, []);

    // Global copy event listener
    useEffect(() => {
        const handleCopy = () => {
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0) {
                showToast('已复制到剪贴板', 'success', 1500);
            }
        };

        document.addEventListener('copy', handleCopy);
        return () => document.removeEventListener('copy', handleCopy);
    }, [showToast]);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    duration={toast.duration}
                    onClose={hideToast}
                />
            )}
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
