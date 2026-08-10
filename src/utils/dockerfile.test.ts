import assert from "assert";
import { resolveDockerfileContent, inferContainerPort } from "./dockerfile";

const customDockerfile = resolveDockerfileContent({
  runtime: "Node",
  customDockerfile: "FROM custom/base\nCMD [\"node\", \"server.js\"]",
});

assert.strictEqual(customDockerfile, "FROM custom/base\nCMD [\"node\", \"server.js\"]");

const generatedDockerfile = resolveDockerfileContent({ runtime: "Node" });
assert.match(generatedDockerfile, /FROM node:18-alpine/);
assert.strictEqual(inferContainerPort(customDockerfile, "Node"), 5006);

console.log("dockerfile helper test passed");
