import { dag, Container, File, Directory, object, func } from "@dagger.io/dagger"

@object()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class NodeTools {

  

  /**
   * Build for production using node of file in source directory .node-version
   */
  @func()
  buildBackend(source: Directory): Directory {
    const nodeVersion = "20.9.0"
    const nodeCache = dag.cacheVolume("node")

    return dag
      .container()
      .from(`node:${nodeVersion}-slim`)
      .withDirectory("/src", source)
      .withMountedCache("/src/node_modules", nodeCache)
      .withWorkdir("/src")
      .withExec(["npm", "install"])
      .withExec(["npm", "run", "build:prod"])
      .directory("/src/dist")
  }

  /**
   * Zip the build directory
   */
  @func()
  archiveBackend(build: Directory): File {
    return dag
      .archivist()
      .tarGz()
      .archive("archive", build)
  }

  /**
   * Exports the build directory as zip file
   */
  @func()
  exportTgz(source: Directory): File {
    const build = this.buildBackend(source)

    return this.archiveBackend(build)
  }

  /**
   * Upload exported tgz file to SSH server
   */
  @func()
  async uploadTgz(tgz: File, esshConfig: File, awsCredentials: File, sshKey: File, hostname: string): Promise<void> {
    const name = await tgz.name()
  
    const prepare = await dag.container()
      .from("digiosysops/deploy-tools:latest")
      .withFile(`/src/${name}`, tgz)
      .withFile("/root/.essh/config.lua", esshConfig)
      .withFile("/root/.aws/credentials", awsCredentials)
      .withFile("/root/.ssh/id_rsa", sshKey)
      .withExec(["essh", "deploy:upload", hostname]).stdout()
      //.withExec(["essh", "--exec", "scp", "-F", "$ESSH_SSH_CONFIG", `/src/${name}`, "tsk-aws-API-V2:~/.deploy/"]).stdout()

    return
  }

  /**
   * Prepare the backend for deployment
   */
  @func()
  async prepareBackend(esshConfig: File, awsCredentials: File, sshKey: File, hostname: string): Promise<void> {
    dag.container()
      .from("digiosysops/deploy-tools:latest")
      .withFile("/root/.essh/config.lua", esshConfig)
      .withFile("/root/.aws/credentials", awsCredentials)
      .withFile("/root/.ssh/id_rsa", sshKey)
      .withExec(["essh", "deploy:prepare", hostname]).stdout()

    return
  }

  /**
   * Extract the backend deploy
   */
  @func()
  async extractBackend(esshConfig: File, awsCredentials: File, sshKey: File, hostname: string): Promise<void> {

    dag.container()
      .from("digiosysops/deploy-tools:latest")
      .withFile("/root/.essh/config.lua", esshConfig)
      .withFile("/root/.aws/credentials", awsCredentials)
      .withFile("/root/.ssh/id_rsa", sshKey)
      .withExec(["essh", "deploy:extract", hostname]).stdout()

    return
  }

  /**
   * Deploy the backend
   */
  @func()
  async deployBackend(source: Directory, esshConfig: File, awsCredentials: File, sshKey: File, hostname: string): Promise<void> {
    const tgz = this.exportTgz(source)
    await this.prepareBackend(esshConfig, awsCredentials, sshKey, hostname)
    await this.uploadTgz(tgz, esshConfig, awsCredentials, sshKey, hostname)
    await this.extractBackend(esshConfig, awsCredentials, sshKey, hostname)

    return
  }
}
