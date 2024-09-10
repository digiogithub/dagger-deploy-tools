/**
 * A generated module for Meteor functions
 *
 * This module has been generated via dagger init and serves as a reference to
 * basic module structure as you get started with Dagger.
 *
 * Two functions have been pre-created. You can modify, delete, or add to them,
 * as needed. They demonstrate usage of arguments and return types using simple
 * echo and grep commands. The functions can be called from the dagger CLI or
 * from one of the SDKs.
 *
 * The first line in this comment block is a short description line and the
 * rest is a long description with more detail on the module's purpose or usage,
 * if appropriate. All modules should have a short description.
 */
import {
  dag,
  Container,
  Directory,
  Secret,
  object,
  func,
} from "@dagger.io/dagger";

@object()
class Meteor {
  /**
   * Returns a container that echoes whatever string argument is provided
   *
   * @param source Source directory
   * @param builderImage Docker image to use for building the Meteor bundle
   * @returns Container
   */
  @func()
  buildBundle(
    source: Directory,
    builderImage: string = "digiosysops/meteor-builder:1.7.0.5",
  ): Container {
    const nodeModulesBuild = dag.cacheVolume("node-modules-build");
    const nodeModulesBundle = dag.cacheVolume("node-modules-bundle");
    const meteorCache = dag.cacheVolume("meteor");

    const buildContainer: Container = dag
      .container()
      .from(builderImage)
      .withDirectory("/opt/meteor/src", source, { owner: "meteor" })
      .withWorkdir("/opt/meteor/src/")
      .withUser("meteor")
      .withMountedCache("/opt/meteor/src/node_modules", nodeModulesBuild, {
        owner: "meteor",
      })
      .withMountedCache("/home/meteor/.meteor/packages/meteor", meteorCache, {
        owner: "meteor",
      })
      .withExec(["npm", "install"])
      .withEnvVariable("NODE_TLS_REJECT_UNAUTHORIZED", "0") // Disable npm ssl errors
      .withEnvVariable("METEOR_DISABLE_OPTIMISTIC_CACHING", "1") // looking the docs this setting improve the memory consumption in build
      .withEnvVariable("METEOR_HEADLESS", "1") // Seen in Meteor Up build code process in github
      .withExec([
        "meteor",
        "build",
        "/opt/meteor",
        "--architecture",
        "os.linux.x86_64",
        "--server-only",
      ])
      .withoutEnvVariable("NODE_TLS_REJECT_UNAUTHORIZED")
      .withWorkdir("/opt/meteor")
      .withExec(["tar", "xzf", "src.tar.gz"])
      .withWorkdir("/opt/meteor/bundle/programs/server")
      .withMountedCache(
        "/opt/meteor/bundle/programs/server/node_modules",
        nodeModulesBundle,
        { owner: "meteor" },
      )
      .withExec(["npm", "install"]);

    return buildContainer;
  }

  /**
   * Returns the final container with the bundle
   *
   * @param bundle Meteor bundle container
   * @param legacyFix Legacy Ubuntu fix for the container
   * @returns Container
   */
  @func()
  buildAndExport(bundle: Container, legacyFix: boolean = false): Container {
    let container: Container;

    if (legacyFix) {
      container = dag
        .container()
        .from("node:8.11.4-stretch")
        .withWorkdir("/opt/meteor")
        .withExec([
          "apt-key",
          "adv",
          "--keyserver",
          "keyring.debian.org",
          "--recv-keys",
          "5C808C2B65558117",
        ])
        .withExec([
          "/bin/sh",
          "-c",
          '`echo "deb http://archive.debian.org/debian/ stretch main\ndeb-src http://archive.debian.org/debian/ stretch main\ndeb http://archive.deb-multimedia.org/ stretch main non-free" > /etc/apt/sources.list`',
        ]);
    } else {
      container = dag
        .container()
        .from("node:12.20.1-buster-slim")
        .withWorkdir("/opt/meteor");
    }

    return container
      .withExec(["apt-get", "update"])
      .withExec(["apt-get", "install", "-y", "--force-yes", "-f", "ffmpeg"])
      .withExec(["rm", "-rf", "/var/lib/apt/lists/*"])
      .withExec(["useradd", "-ms", "/bin/bash", "meteor"])
      .withExec(["chown", "meteor:meteor", "/opt/meteor"])
      .withDirectory("/opt/meteor", bundle.directory("/opt/meteor/bundle"), {
        owner: "meteor",
        exclude: ["src", "src.tar.gz"],
      })
      .withFile(
        "/opt/meteor/settings.json",
        bundle.file("/opt/meteor/src/settings.json"),
        { owner: "meteor" },
      )
      .withFile(
        "/opt/meteor/entrypoint.sh",
        bundle.file("/opt/meteor/src/entrypoint.sh"),
        { owner: "meteor" },
      )
      .withUser("meteor")
      .withExec(["chmod", "+x", "entrypoint.sh"])
      .withEntrypoint(["/opt/meteor/entrypoint.sh"]);
  }

  /**
   * Returns the final container with the bundle builded
   *
   * @param source Source directory
   * @param builderImage Docker image to use for building the Meteor bundle
   * @param legacyFix Legacy Ubuntu fix for the container
   * @returns Container
   */
  @func()
  build(
    source: Directory,
    builderImage: string = "digiosysops/meteor-builder:1.7.0.5",
    legacyFix: boolean = false,
  ): Container {
    const finalContainer = this.buildAndExport(
      this.buildBundle(source, builderImage),
      legacyFix,
    );

    return finalContainer;
  }

  /**
   * Tag image and push to registry
   *
   * @param source Source directory
   * @param builderImage Docker image to use for building the Meteor bundle
   * @param registryPath The Container Registry path
   * @param registryLogin Registry login
   * @param registryPassword Registry password
   * @param tagVersion Tag version
   * @param legacyFix Legacy Ubuntu fix for the container
   * @returns The urls of the pushed images
   */
  @func()
  async tagAndPush(
    source: Directory,
    builderImage: string = "digiosysops/meteor-builder:1.7.0.5",
    registryPath: string,
    registryLogin: string,
    registryPassword: Secret,
    tagVersion: string,
    legacyFix: boolean = false,
  ): Promise<string[]> {
    //get from registryPath the registry domain uri
    const registry = registryPath.split("/")[0];

    const finalContainer = this.build(
      source,
      builderImage,
      legacyFix,
    ).withRegistryAuth(registry, registryLogin, registryPassword);

    const tags = ["latest", tagVersion];

    const addr: string[] = [];
    for (const tag in tags) {
      const a = await finalContainer.publish(`${registryPath}:${tags[tag]}`);
      addr.push(a);
    }

    return addr;
  }
}
