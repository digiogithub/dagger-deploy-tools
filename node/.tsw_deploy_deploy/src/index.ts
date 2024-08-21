import {
  dag,
  Container,
  File,
  Directory,
  object,
  func,
} from "@dagger.io/dagger";

@object()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class NodeTools {
  private static readonly CACHEBUSTER_ENABLED = true;

  /**
   * Build for production
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
   */
  @func()
  buildBackend(
    source: Directory,
    buildTask: string = "build:prod",
    forceInstallNpm: boolean = false,
    includeDirs: string = "",
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

    // Explode includeDirs with comma separator
    const dirs = includeDirs.split(",");
    if (dirs.length > 0) {
      let directories = buildImage.directory("/src/dist");

      dirs.forEach((dir) => {
        const paths = dir.split(":");
        directories = directories.withDirectory(
          paths[0],
          buildImage.directory(paths[1]),
        );
      });

      return directories;
    } else {
      return buildImage.directory("/src/dist");
    }
  }

  /**
   * Zip the build directory
   */
  @func()
  archiveBackend(build: Directory): File {
    return dag.archivist().tarGz().archive("archive", build);
  }

  /**
   * Exports the build directory as zip file
   */
  @func()
  exportTgz(
    source: Directory,
    buildTask: string = "build:prod",
    forceInstallNpm: boolean = false,
    includeDirs: string = "",
  ): File {
    const build = this.buildBackend(
      source,
      buildTask,
      forceInstallNpm,
      includeDirs,
    );

    return this.archiveBackend(build);
  }

  /**
   * Upload exported tgz file to SSH server
   */
  @func()
  async uploadTgz(
    tgz: File,
    esshConfig: File,
    awsCredentials: File,
    sshKey: File,
    hostname: string,
  ): Promise<string> {
    const name = await tgz.name();

    let cacheBuster = "";
    if (NodeTools.CACHEBUSTER_ENABLED) {
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
      .withExec(["essh", "deploy:upload", hostname])
      .stdout();

    return prepare;
  }

  /**
   * Prepare the backend for deployment
   */
  @func()
  async prepareBackend(
    esshConfig: File,
    awsCredentials: File,
    sshKey: File,
    hostname: string,
  ): Promise<string> {
    return dag
      .container()
      .from("digiosysops/deploy-tools:latest")
      .withFile("/root/.essh/config.lua", esshConfig)
      .withFile("/root/.aws/credentials", awsCredentials)
      .withFile("/root/.ssh/id_rsa", sshKey)
      .withExec(["essh", "deploy:prepare", hostname])
      .stdout();
  }

  /**
   * Extract the backend deploy
   */
  @func()
  async extractBackend(
    esshConfig: File,
    awsCredentials: File,
    sshKey: File,
    hostname: string,
  ): Promise<string> {
    let cacheBuster = "";
    if (NodeTools.CACHEBUSTER_ENABLED) {
      cacheBuster = Date.now().toString();
    }

    return dag
      .container()
      .from("digiosysops/deploy-tools:latest")
      .withFile("/root/.essh/config.lua", esshConfig)
      .withFile("/root/.aws/credentials", awsCredentials)
      .withFile("/root/.ssh/id_rsa", sshKey)
      .withEnvVariable("CACHEBUSTER", cacheBuster)
      .withExec(["essh", "deploy:extract", hostname])
      .stdout();
  }

  /**
   * Deploy the backend
   */
  @func()
  async deployBackend(
    source: Directory,
    esshConfig: File,
    awsCredentials: File,
    sshKey: File,
    hostname: string,
    buildTask: string = "build:prod",
    forceInstallNpm: boolean = false,
    includeDirs: string = "",
  ): Promise<string> {
    const tgz = this.exportTgz(source, buildTask, forceInstallNpm, includeDirs);
    await this.prepareBackend(esshConfig, awsCredentials, sshKey, hostname);
    await this.uploadTgz(tgz, esshConfig, awsCredentials, sshKey, hostname);
    return await this.extractBackend(
      esshConfig,
      awsCredentials,
      sshKey,
      hostname,
    );
  }

  /**
   * Rollback the backend
   */
  @func()
  async rollbackBackend(
    esshConfig: File,
    awsCredentials: File,
    sshKey: File,
    hostname: string,
  ): Promise<string> {
    return dag
      .container()
      .from("digiosysops/deploy-tools:latest")
      .withFile("/root/.essh/config.lua", esshConfig)
      .withFile("/root/.aws/credentials", awsCredentials)
      .withFile("/root/.ssh/id_rsa", sshKey)
      .withExec(["essh", "deploy:rollback", hostname])
      .stdout();
  }

  /**
   * Run essh task
   */
  @func()
  async runTask(
    esshConfig: File,
    awsCredentials: File,
    sshKey: File,
    hostname: string,
    task: string,
  ): Promise<string> {
    let cacheBuster = "";
    if (NodeTools.CACHEBUSTER_ENABLED) {
      cacheBuster = Date.now().toString();
    }

    return dag
      .container()
      .from("digiosysops/deploy-tools:latest")
      .withFile("/root/.essh/config.lua", esshConfig)
      .withFile("/root/.aws/credentials", awsCredentials)
      .withFile("/root/.ssh/id_rsa", sshKey)
      .withEnvVariable("CACHEBUSTER", cacheBuster)
      .withExec(["essh", task, hostname])
      .stdout();
  }
}
