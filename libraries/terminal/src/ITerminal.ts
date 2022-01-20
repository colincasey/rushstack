// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminalProvider } from './ITerminalProvider';

/**
 * @beta
 */
export interface ITerminal {
  /**
   * Subscribe a new terminal provider.
   */
  registerProvider(provider: ITerminalProvider): void;

  /**
   * Unsubscribe a terminal provider. If the provider isn't subscribed, this function does nothing.
   */
  unregisterProvider(provider: ITerminalProvider): void;

  /**
   * Write a generic message to the terminal
   */
  write(...messageParts: string[]): void;

  /**
   * Write a generic message to the terminal, followed by a newline
   */
  writeLine(...messageParts: string[]): void;

  /**
   * Write a warning message to the console with yellow text.
   *
   * @remarks
   * The yellow color takes precedence over any other foreground colors set.
   */
  writeWarning(...messageParts: string[]): void;

  /**
   * Write a warning message to the console with yellow text, followed by a newline.
   *
   * @remarks
   * The yellow color takes precedence over any other foreground colors set.
   */
  writeWarningLine(...messageParts: string[]): void;

  /**
   * Write an error message to the console with red text.
   *
   * @remarks
   * The red color takes precedence over any other foreground colors set.
   */
  writeError(...messageParts: string[]): void;

  /**
   * Write an error message to the console with red text, followed by a newline.
   *
   * @remarks
   * The red color takes precedence over any other foreground colors set.
   */
  writeErrorLine(...messageParts: string[]): void;

  /**
   * Write a verbose-level message.
   */
  writeVerbose(...messageParts: string[]): void;

  /**
   * Write a verbose-level message followed by a newline.
   */
  writeVerboseLine(...messageParts: string[]): void;

  /**
   * Write a debug-level message.
   */
  writeDebug(...messageParts: string[]): void;

  /**
   * Write a debug-level message followed by a newline.
   */
  writeDebugLine(...messageParts: string[]): void;
}
