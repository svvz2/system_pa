import type { SimulatorCommand } from './commands.js';
import {
  eventKey,
  newBootId,
  signSyncBody,
  type CommandResult,
  type DeviceEvent,
  type SlotReport,
  type SyncBody,
} from './protocol.js';

interface ServerCommand {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  expiresAt: string;
}

export class GarageSimulator {
  readonly slots: SlotReport[] = Array.from({ length: 6 }, (_, index) => ({
    slotNumber: index + 1,
    distanceCm: 100,
    occupied: false,
    health: 'ok' as const,
  }));
  bootId = newBootId();
  seq = 0;
  online = true;
  gateState = 'closed';
  pendingEntryCommandId: string | null = null;
  private eventCounter = 0;
  private events: DeviceEvent[] = [];
  private commandResults: CommandResult[] = [];
  private syncing = false;

  constructor(
    readonly deviceId: string,
    private readonly masterSecret: string,
    private readonly syncUrl: string,
  ) {}

  private emit(type: string, extra: Partial<DeviceEvent> = {}) {
    this.events.push({
      eventKey: eventKey(this.bootId, this.eventCounter++),
      type,
      occurredAt: new Date().toISOString(),
      ...extra,
    });
  }

  handle(command: SimulatorCommand) {
    switch (command.type) {
      case 'slot': {
        const slot = this.slots[command.slotNumber - 1];
        const occupied = command.state === 'occupied';
        const stateChanged = slot.occupied !== occupied;
        const recovered = slot.health !== 'ok';
        slot.occupied = occupied;
        slot.distanceCm = occupied ? 12 : 100;
        slot.health = 'ok';
        if (stateChanged) {
          this.emit(occupied ? 'slot_occupied' : 'slot_freed', { slotNumber: command.slotNumber });
        } else if (recovered) {
          this.emit('sensor_recovered', { slotNumber: command.slotNumber });
        }
        return `P${command.slotNumber}: ${command.state}`;
      }
      case 'fault': {
        const slot = this.slots[command.slotNumber - 1];
        slot.health = 'fault';
        slot.distanceCm = null;
        this.emit('sensor_fault', { slotNumber: command.slotNumber });
        return `P${command.slotNumber}: sensor fault`;
      }
      case 'entry':
        if (!this.pendingEntryCommandId) return 'لا يوجد أمر دخول منتظر';
        this.gateState = 'closed';
        this.emit('entry_passage', { commandId: this.pendingEntryCommandId });
        this.commandResults.push({ commandId: this.pendingEntryCommandId, status: 'executed' });
        this.pendingEntryCommandId = null;
        return 'تم عبور الدخول وإغلاق البوابة';
      case 'exit':
        this.gateState = 'closed';
        this.emit('exit_passage');
        return 'تم عبور الخروج التلقائي';
      case 'offline': this.online = false; return 'الشبكة مفصولة؛ الأحداث ستبقى في الطابور';
      case 'online': this.online = true; return 'الشبكة عادت';
      case 'reboot':
        this.bootId = newBootId(); this.seq = 0; this.eventCounter = 0; this.gateState = 'closed';
        return `إعادة تشغيل، bootId=${this.bootId}`;
      case 'status': return this.status();
      case 'help': return '';
      case 'quit': return 'quit';
    }
  }

  status() {
    const slots = this.slots.map((slot) => `P${slot.slotNumber}:${slot.health === 'fault' ? 'FAULT' : slot.occupied ? 'OCC' : 'FREE'}`).join(' ');
    return `online=${this.online} gate=${this.gateState} seq=${this.seq} queuedEvents=${this.events.length}\n${slots}`;
  }

  async sync() {
    if (!this.online || this.syncing) return;
    this.syncing = true;
    const body: SyncBody = {
      deviceId: this.deviceId,
      bootId: this.bootId,
      seq: this.seq++,
      firmwareVersion: 'simulator-1.0.0',
      gateState: this.gateState,
      slots: this.slots,
      events: [...this.events],
      commandResults: [...this.commandResults],
    };
    const { rawBody, signature } = signSyncBody(this.masterSecret, body);
    try {
      const response = await fetch(this.syncUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-device-signature': signature },
        body: rawBody,
      });
      const result = await response.json() as { error?: string; commands?: ServerCommand[] };
      if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      this.events.splice(0, body.events.length);
      this.commandResults.splice(0, body.commandResults.length);
      for (const command of result.commands ?? []) this.acceptServerCommand(command);
    } catch (error) {
      process.stderr.write(`sync error: ${error instanceof Error ? error.message : String(error)}\n`);
    } finally {
      this.syncing = false;
    }
  }

  private acceptServerCommand(command: ServerCommand) {
    if (new Date(command.expiresAt).getTime() <= Date.now()) return;
    this.commandResults.push({ commandId: command.id, status: 'acknowledged' });
    if (command.type === 'open_entry') {
      this.gateState = 'open_entry';
      this.pendingEntryCommandId = command.id;
      process.stdout.write(`\nأمر دخول: البوابة مفتوحة، الموقف P${command.payload.slotNumber}. اكتب entry لتأكيد العبور.\n> `);
      return;
    }
    if (command.type === 'open_gate') {
      this.gateState = 'open_entry';
      this.commandResults.push({ commandId: command.id, status: 'executed' });
      setTimeout(() => { this.gateState = 'closed'; }, 3000);
      return;
    }
    this.commandResults.push({ commandId: command.id, status: 'executed' });
  }
}
