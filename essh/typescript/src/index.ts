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
class EsshTasks {
  /**
   * Run essh task
   *
   * @param esshConfig Essh configuration file
   * @param awsCredentials AWS credentials file
   * @param sshKey SSH key file
   * @param hostname SSH hostname
   * @param task Task to run
   * @param taskParams Task parameters
   * @param cacheEnabled Enable cache busting
   * @returns Task output
   */
  @func()
  async runTask(
    esshConfig: File,
    awsCredentials: File,
    sshKey: File,
    task: string,
    taskParams: string,
    cacheEnabled: boolean = false,
  ): Promise<string> {
    let cacheBuster = "";
    if (!cacheEnabled) {
      cacheBuster = Date.now().toString();
    }

    let fullcommand = ["essh", task].concat(taskParams.split(" "));

    return dag
      .container()
      .from("digiosysops/deploy-tools:latest")
      .withFile("/root/.essh/config.lua", esshConfig)
      .withFile("/root/.aws/credentials", awsCredentials)
      .withFile("/root/.ssh/id_rsa", sshKey)
      .withEnvVariable("CACHEBUSTER", cacheBuster)
      .withExec(["chmod", "400", "/root/.ssh/id_rsa"])
      .withExec(["essh", task, taskParams])
      .stdout();
  }
}
