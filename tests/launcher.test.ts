import { describe, expect, it, vi } from "vite-plus/test"
import { setLauncherDragData } from "../src/lib/launcher"

describe("authlib-injector launcher drag contract", () => {
  it("exports a percent-encoded API root as plain text with copy semantics", () => {
    const transfer = {
      setData: vi.fn(),
      effectAllowed: "uninitialized" as DataTransfer["effectAllowed"],
      dropEffect: "none" as DataTransfer["dropEffect"],
    }
    const address = "https://minehub.example.com/api/yggdrasil/"
    setLauncherDragData(transfer, address)
    expect(transfer.setData).toHaveBeenCalledWith(
      "text/plain",
      "authlib-injector:yggdrasil-server:https%3A%2F%2Fminehub.example.com%2Fapi%2Fyggdrasil%2F"
    )
    expect(transfer.effectAllowed).toBe("copy")
    expect(transfer.dropEffect).toBe("copy")
  })
})
