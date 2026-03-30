/**
 * Helper class (default export re-exported as named)
 */

export default class Helper {
  private value: string;

  constructor(value: string) {
    this.value = value;
  }

  getValue(): string {
    return this.value;
  }

  setValue(value: string): void {
    this.value = value;
  }
}
