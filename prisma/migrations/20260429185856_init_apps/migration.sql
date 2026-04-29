/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `App` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[appId,key]` on the table `EnvVar` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "App_name_key" ON "App"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EnvVar_appId_key_key" ON "EnvVar"("appId", "key");
