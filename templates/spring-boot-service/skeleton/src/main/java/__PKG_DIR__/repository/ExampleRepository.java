package __JAVA_PKG__.repository;

import __JAVA_PKG__.domain.ExampleEntity;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Persistence for {@link ExampleEntity}.
 *
 * <p>Spring Data implements this at run time, so the interface is the whole declaration: add a
 * method whose name describes the query and the implementation follows.
 */
public interface ExampleRepository extends JpaRepository<ExampleEntity, Long> {}
