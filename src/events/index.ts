import * as EventEmitter from 'events'

const emitter = new EventEmitter()

export type EventHandler = (emitter: EventEmitter) => void
import * as eventHandlerModule from './handlers'

const eventHandlers: [EventHandler] = (eventHandlerModule as any).values()

for (const eventHandler of eventHandlers) {
  eventHandler(emitter)
}

export default emitter
