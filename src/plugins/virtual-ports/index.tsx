import { Cable } from 'lucide-react';
import { Plugin } from '../../types/plugin';
import { VirtualPortManager } from './VirtualPortManager';

export const VirtualPortsPlugin: Plugin = {
    id: 'virtual-ports',
    name: 'Virtual Serial Port',
    version: '1.0.0',
    description: 'Create and manage virtual serial port pairs (VSPD emulation)',
    icon: Cable,
    sidebarComponent: VirtualPortManager,

    activate: (context) => {
        console.log('Virtual Ports Plugin Activated');
        // Register commands if necessary
        context.registerCommand('virtual-ports.create', () => {
            console.log('Create virtual port command triggered');
        });
    },

    deactivate: (context) => {
        console.log('Virtual Ports Plugin Deactivated');
    }
};
