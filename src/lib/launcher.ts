export function setLauncherDragData(
  transfer: Pick<DataTransfer, "setData" | "effectAllowed" | "dropEffect">,
  address: string
) {
  transfer.setData(
    "text/plain",
    `authlib-injector:yggdrasil-server:${encodeURIComponent(address)}`
  )
  transfer.effectAllowed = "copy"
  transfer.dropEffect = "copy"
}
