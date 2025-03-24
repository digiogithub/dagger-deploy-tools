import {
  dag,
  Container,
  File,
  Directory,
  Secret,
  object,
  func,
  entrypoint,
} from "@dagger.io/dagger";
import { node } from "@opentelemetry/sdk-node";

@object()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class NodeTools {
  /**
   * Build for production, this is a legacy function
   *
   * @param source Source directory
   * @param buildTask Build task to run in package.json
   * @param forceInstallNpm Force install npm packages (depends the project)
   * @param includeNodeModules Include node_modules directory in the build
   * @param nodeVersion Node version to use
   * @returns Directory
   */
  @func()
  buildBackendLegacy(
    source: Directory,
    buildTask: string = "build:prod",
    forceInstallNpm: boolean = false,
    includeNodeModules: boolean = false,
    nodeVersion: string = "20.9.0",
  ): Directory {
    const forceParameter = "--force";

    let npmInstallCli: string[] = ["npm", "install"];
    if (forceInstallNpm) {
      npmInstallCli = npmInstallCli.concat(forceParameter);
    }

    const buildImage = dag
      .container()
      .from(`node:${nodeVersion}-slim`)
      .withDirectory("/src", source)
      .withWorkdir("/src")
      .withExec(["npm", "install", "-g", "npm@10.8.2"])
      .withExec(npmInstallCli)
      .withExec(["npm", "run", buildTask]);

    if (includeNodeModules) {
      return buildImage
        .directory("/src/dist")
        .withDirectory(
          "/node_modules",
          buildImage.directory("/src/node_modules/"),
        )
        .withDirectory("/src/certs", buildImage.directory("/src/src/certs/"));
    } else {
      return buildImage.directory("/src/dist");
    }
  }

  /**
   * Build for production using node of file in source directory .node-version
   *
   * @param source Source directory
   * @param buildTask Build task to run in package.json
   * @param forceInstallNpm Force install npm packages (depends the project)
   * @param includeDirs Include directories in the build
   * @param includeFiles Include files in the build
   * @param nodeVersion Node version to use
   * @returns Directory
   */
  @func()
  buildBackend(
    source: Directory,
    buildTask: string = "build:prod",
    forceInstallNpm: boolean = false,
    includeDirs: string = "",
    includeFiles: string = "",
    nodeVersion: string = "20.9.0",
  ): Directory {
    const forceParameter = "--force";

    let npmInstallCli: string[] = ["npm", "install"];
    if (forceInstallNpm) {
      npmInstallCli = npmInstallCli.concat(forceParameter);
    }

    const buildImage = dag
      .container()
      .from(`node:${nodeVersion}-slim`)
      .withDirectory("/src", source)
      .withWorkdir("/src")
      .withExec(["npm", "install", "-g", "npm@10.8.2"])
      .withExec(npmInstallCli)
      .withExec(["npm", "run", buildTask]);

    // Initial base directory
    let returnedDirectory = buildImage.directory("/src/dist");

    // Explode includeFiles with comma separator
    const files = includeFiles.split(",");
    if (files.length > 0 && files[0] !== "") {
      files.forEach((file) => {
        const paths = file.split(":");
        returnedDirectory = returnedDirectory.withFile(
          paths[0],
          buildImage.file(paths[1]),
        );
      });
    }

    // Explode includeDirs with comma separator
    const dirs = includeDirs.split(",");
    if (dirs.length > 0 && dirs[0] !== "") {
      dirs.forEach((dir) => {
        const paths = dir.split(":");
        returnedDirectory = returnedDirectory.withDirectory(
          paths[0],
          buildImage.directory(paths[1]),
        );
      });
    }

    return returnedDirectory;
  }

  /**
   * Tag image and push to registry
   *
   * @param source Source directory
   * @param registryPath The Container Registry path
   * @param registryLogin Registry login
   * @param registryPassword Registry password
   * @param tagVersion Tag version
   * @param entrypoint Entrypoint to use
   * @param buildTask Build task to run in package.json
   * @param forceInstallNpm Force install npm packages (depends the project)
   * @param includeDirs Include directories in the build
   * @param includeFiles Include files in the build
   * @param nodeVersion Node version to use
   * @param alternativeImage Alternative container image to use (defaults to node:NODE_VERSION-slim which replaces NODE_VERSION with nodeVersion)
   * @returns The urls of the pushed images
   */
  @func()
  async tagAndPush(
    source: Directory,
    registryPath: string,
    registryLogin: string,
    registryPassword: Secret,
    tagVersion: string,
    entrypoint: string = "npm run start:prod",
    buildTask: string = "build:prod",
    forceInstallNpm: boolean = false,
    includeDirs: string = "",
    includeFiles: string = "",
    nodeVersion: string = "20.9.0",
    alternativeImage: string = "node:NODE_VERSION-slim"
  ): Promise<string[]> {
    // Get registry domain from path
    const registry = registryPath.split("/")[0];

    const imageToUse = alternativeImage === "node:NODE_VERSION-slim" 
      ? `node:${nodeVersion}-slim`
      : alternativeImage;

    // Create final container with the build
    const finalContainer = await this.containerBackend(
      source,
      tagVersion,
      entrypoint,
      buildTask,
      forceInstallNpm,
      includeDirs,
      includeFiles,
      nodeVersion,
      imageToUse
    );
    finalContainer.withRegistryAuth(registry, registryLogin, registryPassword);

    // Push with multiple tags
    const tags = ["latest", tagVersion];
    const addr: string[] = [];

    for (const tag of tags) {
      const publishedAddr = await finalContainer.publish(`${registryPath}:${tag}`);
      addr.push(publishedAddr);
    }

    return addr;
  }

  /**
   * Create a container with the build
   *
   * @param source Source directory
   * @param tagVersion Tag version
   * @param entrypoint Entrypoint to use
   * @param buildTask Build task to run in package.json
   * @param forceInstallNpm Force install npm packages (depends the project)
   * @param includeDirs Include directories in the build
   * @param includeFiles Include files in the build
   * @param nodeVersion Node version to use
   * @param alternativeImage Alternative container image to use (defaults to node:NODE_VERSION-slim which replaces NODE_VERSION with nodeVersion)
   * @returns Container
   */
  @func()
  async containerBackend(
    source: Directory,
    tagVersion: string,
    entrypoint: string = "npm run start:prod",
    buildTask: string = "build:prod",
    forceInstallNpm: boolean = false,
    includeDirs: string = "",
    includeFiles: string = "",
    nodeVersion: string = "20.9.0",
    alternativeImage: string = "node:NODE_VERSION-slim"
  ): Promise<Container> {

    // Build the application
    const buildDir = this.buildBackend(
      source,
      buildTask,
      forceInstallNpm,
      includeDirs,
      includeFiles,
      nodeVersion
    );

    const imageToUse = alternativeImage === "node:NODE_VERSION-slim" 
      ? `node:${nodeVersion}-slim`
      : alternativeImage;

    // Create final container with the build
    let finalContainer = dag
      .container()
      .from(imageToUse)
      .withWorkdir("/app")
      .withDirectory("/app", buildDir)
      .withEntrypoint(entrypoint.split(" "));
    
    // only for node:NODE_VERSION-slim
    if (alternativeImage === "node:NODE_VERSION-slim") {
      finalContainer = finalContainer
        .withExec(["apt-get", "update"])
        .withExec(["apt-get", "install", "-y", "procps"])
        .withExec(["rm", "-rf", "/var/lib/apt/lists/*"]);
    }

    return finalContainer;
  }


  /**
   * Zip the build directory
   *
   * @param build Build directory (output of buildBackend)
   * @returns Zipped file
   */
  @func()
  archiveBackend(build: Directory): File {
    return dag.archivist().tarGz().archive("archive", build);
  }

  /**
   * Exports the build directory as zip file
   *
   * @param source Source directory
   * @param buildTask Build task to run in package.json
   * @param forceInstallNpm Force install npm packages (depends the project)
   * @param includeDirs Include directories in the build
   * @param includeFiles Include files in the build
   * @param nodeVersion Node version to use
   * @returns Exported tgz file
   */
  @func()
  exportTgz(
    source: Directory,
    buildTask: string = "build:prod",
    forceInstallNpm: boolean = false,
    includeDirs: string = "",
    includeFiles: string = "",
    nodeVersion: string = "20.0.9",
  ): File {
    const build = this.buildBackend(
      source,
      buildTask,
      forceInstallNpm,
      includeDirs,
      includeFiles,
      nodeVersion,
    );

    return this.archiveBackend(build);
  }

  /**
   * Upload exported tgz file to SSH server
   *
   * @param tgz Exported tgz file
   * @param esshConfig eSSH configuration file
   * @param awsCredentials AWS credentials file
   * @param sshKey SSH key file
   * @param hostname SSH hostname
   * @param cacheEnabled Enable cache busting
   * @returns Server output
   */
  @func()
  async uploadTgz(
    tgz: File,
    esshConfig: File,
    awsCredentials: File,
    sshKey: File,
    hostname: string,
    cacheEnabled: boolean = false,
    deployPath: string = "/home/ubuntu/.deploy/",
  ): Promise<string> {
    const name = await tgz.name();

    let cacheBuster = "";
    if (!cacheEnabled) {
      cacheBuster = Date.now().toString();
    }

    const prepare = await dag
      .container()
      .from("digiosysops/deploy-tools:latest")
      .withFile(`/src/${name}`, tgz)
      .withFile("/root/.essh/config.lua", esshConfig)
      .withFile("/root/.aws/credentials", awsCredentials)
      .withFile("/root/.ssh/id_rsa", sshKey)
      .withEnvVariable("CACHEBUSTER", cacheBuster)
      .withExec(["essh", "deploy:upload", hostname, deployPath])
      .stdout();

    return prepare;
  }

  /**
   * Prepare the backend for deployment
   *
   * @param esshConfig Essh configuration file
   * @param awsCredentials AWS credentials file
   * @param sshKey SSH key file
   * @param hostname SSH hostname
   * @returns Server output
   */
  @func()
  async prepareBackend(
    esshConfig: File,
    awsCredentials: File,
    sshKey: File,
    hostname: string,
    deployPath: string = "/home/ubuntu/.deploy/",
  ): Promise<string> {
    return dag
      .container()
      .from("digiosysops/deploy-tools:latest")
      .withFile("/root/.essh/config.lua", esshConfig)
      .withFile("/root/.aws/credentials", awsCredentials)
      .withFile("/root/.ssh/id_rsa", sshKey)
      .withExec(["essh", "deploy:prepare", hostname, deployPath])
      .stdout();
  }

  /**
   * Extract the backend deploy
   *
   * @param esshConfig Essh configuration file
   * @param awsCredentials AWS credentials file
   * @param sshKey SSH key file
   * @param hostname SSH hostname
   * @param cacheEnabled Enable cache busting
   * @returns Server output
   */
  @func()
  async extractBackend(
    esshConfig: File,
    awsCredentials: File,
    sshKey: File,
    hostname: string,
    cacheEnabled: boolean = false,
    deployPath: string = "/home/ubuntu/.deploy/",
  ): Promise<string> {
    let cacheBuster = "";
    if (!cacheEnabled) {
      cacheBuster = Date.now().toString();
    }

    return dag
      .container()
      .from("digiosysops/deploy-tools:latest")
      .withFile("/root/.essh/config.lua", esshConfig)
      .withFile("/root/.aws/credentials", awsCredentials)
      .withFile("/root/.ssh/id_rsa", sshKey)
      .withEnvVariable("CACHEBUSTER", cacheBuster)
      .withExec(["essh", "deploy:extract", hostname, deployPath])
      .stdout();
  }

  /**
   * Deploy the backend
   *
   * @param source Source directory
   * @param esshConfig Essh configuration file
   * @param awsCredentials AWS credentials file
   * @param sshKey SSH key file
   * @param hostname SSH hostname
   * @param buildTask Build task to run in package.json
   * @param forceInstallNpm Force install npm packages (depends the project)
   * @param includeDirs Include directories in the build
   * @param includeFiles Include files in the build
   * @param cacheEnabled Enable cache busting
   * @param deployPath Deploy path
   * @returns Deployment output
   */
  @func()
  async deployBackend(
    source: Directory,
    esshConfig: File,
    awsCredentials: File,
    sshKey: File,
    hostname: string,
    buildTask: string = "build:prod",
    nodeVersion: string = "20.0.9",
    forceInstallNpm: boolean = false,
    includeDirs: string = "",
    includeFiles: string = "",
    cacheEnabled: boolean = false,
    deployPath: string = "/home/ubuntu/.deploy/",
  ): Promise<string> {
    const tgz = this.exportTgz(
      source,
      buildTask,
      forceInstallNpm,
      includeDirs,
      includeFiles,
      nodeVersion,
    );
    await this.prepareBackend(esshConfig, awsCredentials, sshKey, hostname, deployPath);
    await this.uploadTgz(
      tgz,
      esshConfig,
      awsCredentials,
      sshKey,
      hostname,
      cacheEnabled,
      deployPath
    );
    return await this.extractBackend(
      esshConfig,
      awsCredentials,
      sshKey,
      hostname,
      cacheEnabled,
      deployPath
    );
  }

  /**
   * Rollback the backend
   *
   * @param esshConfig Essh configuration file
   * @param awsCredentials AWS credentials file
   * @param sshKey SSH key file
   * @param hostname SSH hostname
   * @param cacheEnabled Enable cache busting
   * @returns Rollback message
   */
  @func()
  async rollbackBackend(
    esshConfig: File,
    awsCredentials: File,
    sshKey: File,
    hostname: string,
    cacheEnabled: boolean = false,
    deployPath: string = "/home/ubuntu/.deploy/",
  ): Promise<string> {
    let cacheBuster = "";
    if (!cacheEnabled) {
      cacheBuster = Date.now().toString();
    }

    return dag
      .container()
      .from("digiosysops/deploy-tools:latest")
      .withFile("/root/.essh/config.lua", esshConfig)
      .withFile("/root/.aws/credentials", awsCredentials)
      .withFile("/root/.ssh/id_rsa", sshKey)
      .withEnvVariable("CACHEBUSTER", cacheBuster)
      .withExec(["essh", "deploy:rollback", hostname, deployPath])
      .stdout();
  }

  /**
   * Run essh task
   *
   * @param esshConfig Essh configuration file
   * @param awsCredentials AWS credentials file
   * @param sshKey SSH key file
   * @param hostname SSH hostname
   * @param task Task to run
   * @param cacheEnabled Enable cache busting
   * @returns Task output
   */
  @func()
  async runTask(
    esshConfig: File,
    awsCredentials: File,
    sshKey: File,
    hostname: string,
    task: string,
    cacheEnabled: boolean = false,
    deployPath: string = "/home/ubuntu/.deploy/",
  ): Promise<string> {
    let cacheBuster = "";
    if (!cacheEnabled) {
      cacheBuster = Date.now().toString();
    }

    return dag
      .container()
      .from("digiosysops/deploy-tools:latest")
      .withFile("/root/.essh/config.lua", esshConfig)
      .withFile("/root/.aws/credentials", awsCredentials)
      .withFile("/root/.ssh/id_rsa", sshKey)
      .withEnvVariable("CACHEBUSTER", cacheBuster)
      .withExec(["essh", task, hostname, deployPath])
      .stdout();
  }
}
