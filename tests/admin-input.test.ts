import { describe, expect, it } from "vite-plus/test"
import { adminArguments, adminEmail } from "../scripts/admin-input"

describe("administrator CLI arguments", () => {
  it("accepts the argument separator forwarded by vp run", () => {
    expect(adminArguments(["--", "admin@example.com", "Admin"])).toEqual({
      email: "admin@example.com",
      name: "Admin",
    })
  })
  it("also accepts npm and direct invocation without a separator", () => {
    expect(adminArguments(["admin@example.com", "Community", "Admin"])).toEqual(
      { email: "admin@example.com", name: "Community Admin" }
    )
    expect(adminArguments([])).toEqual({ email: undefined, name: "Admin" })
  })
  it("normalizes a valid address and rejects the PowerShell backslash", () => {
    expect(adminEmail(" Admin@Example.com ")).toBe("admin@example.com")
    expect(() => adminEmail("admin\\@example.com")).toThrow("不需要转义")
    expect(() => adminEmail("--")).toThrow("邮箱格式无效")
  })
})
