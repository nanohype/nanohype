package __JAVA_PKG__;

import static org.assertj.core.api.Assertions.assertThat;

import __JAVA_PKG__.domain.ExampleEntity;
import __JAVA_PKG__.repository.ExampleRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Full-stack integration test against a real PostgreSQL container — exercises
 * Flyway migrations, Hibernate schema validation, and JPA repository flow.
 * Uses the default profile (not the H2-based `test` profile) so that the
 * production migration path is verified end-to-end.
 */
@SpringBootTest
@Testcontainers
class ExampleIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    ExampleRepository repo;

    @Test
    void persistsAndLoadsEntity() {
        ExampleEntity saved = repo.save(new ExampleEntity("integration-test"));

        ExampleEntity loaded = repo.findById(saved.getId()).orElseThrow();

        assertThat(loaded.getName()).isEqualTo("integration-test");
        assertThat(loaded.getCreatedAt()).isNotNull();
    }
}
