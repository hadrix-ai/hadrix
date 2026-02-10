import type { PluginWorkshopPluginDomainModel } from "../domain/pluginWorkshopPluginDomainModel.js";

export type PluginWorkshopRosterApiResponse = {
  plugins: PluginWorkshopPluginDomainModel[];
  count: number;
};
