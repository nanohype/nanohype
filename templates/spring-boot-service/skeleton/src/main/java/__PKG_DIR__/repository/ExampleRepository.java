package __JAVA_PKG__.repository;

import __JAVA_PKG__.domain.ExampleEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExampleRepository extends JpaRepository<ExampleEntity, Long> {
}
