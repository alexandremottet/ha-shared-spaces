import type { HassEntity, HomeAssistant } from "./hass";

export function findMyPerson(hass: HomeAssistant | undefined): HassEntity | undefined {
  const userId = hass?.user?.id;
  if (!hass || !userId) {
    return undefined;
  }
  return Object.values(hass.states).find(
    (entity) => entity.entity_id.startsWith("person.") && entity.attributes.user_id === userId
  );
}
