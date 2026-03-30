/**
 * Package with class exports
 */

export class BaseEntity {
  public readonly id: string;
  protected data: Record<string, unknown>;

  constructor(id: string) {
    this.id = id;
    this.data = {};
  }

  public getId(): string {
    return this.id;
  }

  public setData(key: string, value: unknown): void {
    this.data[key] = value;
  }

  public getData(key: string): unknown {
    return this.data[key];
  }
}

export class User extends BaseEntity {
  public name: string;
  public email: string;
  private password: string;

  static readonly ADMIN_ROLE = "admin";
  static readonly USER_ROLE = "user";

  constructor(id: string, name: string, email: string) {
    super(id);
    this.name = name;
    this.email = email;
    this.password = "";
  }

  static createAdmin(id: string, name: string, email: string): User {
    const user = new User(id, name, email);
    user.setData("role", User.ADMIN_ROLE);
    return user;
  }

  public setPassword(password: string): void {
    this.password = password;
  }

  public validatePassword(password: string): boolean {
    return this.password === password;
  }
}

// Abstract class
export abstract class Service {
  abstract getName(): string;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  public isRunning(): boolean {
    return false;
  }
}
